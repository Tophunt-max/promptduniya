import { useAi } from '@pd/db';

import { AppError } from '../../lib/errors';
import { decodeBase64, type GeneratedImage, type ImageEngine, type ImageRequest } from './types';

/**
 * Cloudflare Workers AI.
 *
 * The reason this is the default: it needs no API key and no credit card. The
 * binding authenticates as the Worker's own account, and the free allocation of
 * 10,000 Neurons a day covers roughly a hundred flux-1-schnell images — enough
 * to backfill the whole catalogue in an afternoon.
 *
 * The limitation is real, though: flux-1-schnell is text-to-image only. It
 * cannot take a reference face, so covers for photo-edit prompts get a
 * described Indian subject rather than a preserved one. That is why
 * `supportsReference` is false and why the caller rewrites the instruction.
 */

/** Fallback when nothing is configured. */
const DEFAULT_MODEL = '@cf/leonardo/lucid-origin';

/** The tightest prompt cap across the supported models. */
const MAX_PROMPT_CHARS = 2000;

/**
 * What each model will actually accept.
 *
 * These schemas differ in ways that matter and cannot be discovered at runtime.
 * flux-1-schnell takes only a prompt and a step count capped at 8, and has no
 * width or height at all — which is why every cover it drew came back square
 * however the prompt was set up, since the requested aspect ratio had nowhere to
 * go. lucid-origin takes dimensions, guidance and up to 40 steps, so a 4:5
 * portrait frame is reproducible and the extra steps are available to spend.
 *
 * Matched on the model id's suffix so an account-scoped prefix cannot break it.
 * Anything unrecognised gets the conservative profile: prompt and steps only.
 */
interface ModelProfile {
  /** Accepts width/height, so a requested aspect ratio can be honoured. */
  dimensions: boolean;
  /** What the model documents as its ceiling. */
  maxSteps: number;
  /** What to ask for — the quality/cost trade-off, kept below the ceiling. */
  steps: number;
  /** Some models name it `num_steps` instead. */
  stepsKey: 'steps' | 'num_steps';
  /** Prompt-adherence strength, where the model exposes one. */
  guidance?: number;
  /** Whether a real negative-prompt field exists. See the note in `generate`. */
  negativePrompt: boolean;
}

const CONSERVATIVE: ModelProfile = {
  dimensions: false,
  maxSteps: 8,
  steps: 8,
  stepsKey: 'steps',
  negativePrompt: false,
};

const PROFILES: Record<string, ModelProfile> = {
  'lucid-origin': {
    dimensions: true,
    maxSteps: 40,
    // Well short of the 40 ceiling: the gain flattens out long before that and
    // steps are billed individually.
    steps: 26,
    stepsKey: 'steps',
    guidance: 4.5,
    negativePrompt: false,
  },
  'flux-1-schnell': {
    dimensions: false,
    // Documented maximum is 8. The code asked for 6, leaving quality on the
    // table for no saving worth having.
    maxSteps: 8,
    steps: 8,
    stepsKey: 'steps',
    negativePrompt: false,
  },
  'stable-diffusion-xl-base-1.0': {
    dimensions: true,
    maxSteps: 20,
    steps: 20,
    stepsKey: 'num_steps',
    negativePrompt: true,
  },
  'stable-diffusion-xl-lightning': {
    dimensions: true,
    maxSteps: 20,
    steps: 8,
    stepsKey: 'num_steps',
    negativePrompt: true,
  },
};

function profileFor(model: string): ModelProfile {
  return PROFILES[model.split('/').pop() ?? ''] ?? CONSERVATIVE;
}

/**
 * Turns an aspect ratio into pixel dimensions.
 *
 * Held to roughly 1.3 megapixels and rounded to multiples of 32, which is what
 * diffusion models expect; an odd size is either rejected or quietly corrected
 * with a stretched result.
 */
export function dimensionsFor(aspectRatio: string | undefined, cap = 2500): { width: number; height: number } {
  const fallback = { width: 1024, height: 1280 };

  const match = /^(\d{1,2})\s*:\s*(\d{1,2})$/.exec((aspectRatio ?? '').trim());
  if (!match) return fallback;

  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!w || !h) return fallback;

  const targetPixels = 1_310_720; // 1024 x 1280
  const scale = Math.sqrt(targetPixels / (w * h));
  const round32 = (value: number) => Math.max(512, Math.min(cap, Math.round(value / 32) * 32));

  return { width: round32(w * scale), height: round32(h * scale) };
}

export class WorkersAiEngine implements ImageEngine {
  readonly name: string;
  readonly supportsReference = false;

  /** The model id is configuration now, so it can be changed from the console. */
  constructor(private readonly model: string = DEFAULT_MODEL) {
    this.name = `workers-ai:${model.split('/').pop() ?? model}`;
  }

  async generate(request: ImageRequest): Promise<GeneratedImage> {
    const ai = useAi();
    if (!ai) {
      throw AppError.badRequest(
        'Workers AI is not bound to this Worker. Add "ai": { "binding": "AI" } to wrangler.jsonc and redeploy.',
      );
    }

    // `request.negative` is only passed to models that have a real field for it.
    //
    // Folding the list into the positive prompt is actively harmful for two
    // reasons. Diffusion models do not parse negation, so "avoid extra fingers"
    // reads as a request for fingers. And the safety classifier scores the whole
    // string: a negative list mentioning faces, limbs and skin is enough to trip
    // it, which is exactly what happened — an ordinary Diwali portrait came back
    // as "8007: Input prompt contains NSFW content".
    //
    // Where there is no such field, quality is defended positively in the
    // instruction itself (see QUALITY_CLAUSE in covers.ts).
    const prompt = request.instruction.slice(0, MAX_PROMPT_CHARS);
    const profile = profileFor(this.model);

    const input: Record<string, unknown> = { prompt };
    input[profile.stepsKey] = Math.min(profile.steps, profile.maxSteps);

    if (profile.dimensions) {
      const { width, height } = dimensionsFor(request.aspectRatio);
      input.width = width;
      input.height = height;
    }
    if (profile.guidance !== undefined) input.guidance = profile.guidance;
    if (profile.negativePrompt && request.negative) {
      input.negative_prompt = request.negative.slice(0, 600);
    }

    let response: unknown;
    try {
      response = await (ai as { run: (model: string, input: unknown) => Promise<unknown> }).run(
        this.model,
        input,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // The daily free allocation is the failure operators will actually hit,
      // so it is worth naming rather than surfacing as a generic 500.
      if (/neuron/i.test(message)) {
        throw AppError.badRequest(
          'Workers AI daily free allocation (10,000 Neurons) is used up. It resets at 00:00 UTC, or switch IMAGE_PROVIDER to "gemini".',
        );
      }
      throw AppError.badRequest(`Workers AI failed: ${message}`);
    }

    const image = (response as { image?: string })?.image;
    if (!image) throw AppError.badRequest('Workers AI returned no image data');

    return {
      bytes: decodeBase64(image),
      // flux-1-schnell returns JPEG bytes; storage re-sniffs the magic bytes
      // anyway, so this is only the declared type.
      mimeType: 'image/jpeg',
      engine: this.name,
      usedReference: false,
    };
  }
}
