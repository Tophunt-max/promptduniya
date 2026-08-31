import { useAi } from '@pd/db';

import { AppError } from '../../lib/errors';
import { decodeBase64, type GeneratedImage, type ImageEngine, type ImageRequest } from './types';

/**
 * Cloudflare Workers AI.
 *
 * Every text-to-image model in the catalogue is reachable from here, which needs
 * more than a model id swap because they do not share a calling convention:
 *
 *   transport   Most take a JSON body. The FLUX.2 family takes multipart form
 *               data — required even when the only field is a prompt.
 *   output      Some resolve to `{ image: <base64> }`. The Stable Diffusion
 *               family and Leonardo's Phoenix resolve to a `ReadableStream` of
 *               raw bytes instead. Reading `.image` off those yields undefined,
 *               which is why selecting them used to fail with "returned no image
 *               data" from a model that had in fact just produced an image.
 *   parameters  `steps` vs `num_steps`; dimension support and ceilings differ;
 *               only some expose a negative prompt; klein-4b fixes its own step
 *               count and rejects one being passed.
 *
 * So each model carries a profile and the engine adapts. An unrecognised id gets
 * the conservative profile — prompt and steps only, both transports' common
 * ground — so a newly released model is usually usable before it is listed here.
 */

/** Fallback when nothing is configured. */
const DEFAULT_MODEL = '@cf/leonardo/lucid-origin';

/** The tightest prompt cap across the supported models. */
const MAX_PROMPT_CHARS = 2000;

interface ModelProfile {
  /** JSON body, or multipart form data as the FLUX.2 family requires. */
  transport: 'json' | 'multipart';
  /** `{ image: base64 }`, or a stream/buffer of raw image bytes. */
  output: 'base64' | 'binary';
  /** Width/height support and the model's own ceiling, when it has one. */
  dimensions: { max: number } | null;
  /** What to ask for, or null where the model fixes its own step count. */
  steps: number | null;
  stepsKey: 'steps' | 'num_steps';
  /** Prompt-adherence strength, where the model exposes one. */
  guidance?: number;
  /** Whether a real negative-prompt field exists. See the note in `generate`. */
  negativePrompt: boolean;
  /** Whether a reference image can be supplied to hold an identity. */
  reference: boolean;
}

const CONSERVATIVE: ModelProfile = {
  transport: 'json',
  output: 'base64',
  dimensions: null,
  steps: 8,
  stepsKey: 'steps',
  negativePrompt: false,
  reference: false,
};

/** Shared by Stable Diffusion and its fine-tunes: same fields, same stream output. */
const STABLE_DIFFUSION: ModelProfile = {
  transport: 'json',
  output: 'binary',
  dimensions: { max: 2048 },
  steps: 20,
  stepsKey: 'num_steps',
  guidance: 7.5,
  negativePrompt: true,
  reference: false,
};

/**
 * FLUX.2: multipart in, base64 out, and up to four reference images.
 *
 * Dimensions cap at 1920 rather than 2048, and the reference support is the
 * reason this family matters here — it is the only way to hold a face without a
 * Gemini key, which is what every photo-edit prompt in the catalogue needs.
 */
const FLUX_2: ModelProfile = {
  transport: 'multipart',
  output: 'base64',
  dimensions: { max: 1920 },
  steps: 25,
  stepsKey: 'steps',
  negativePrompt: false,
  reference: true,
};

const PROFILES: Record<string, ModelProfile> = {
  'lucid-origin': {
    transport: 'json',
    output: 'base64',
    dimensions: { max: 2500 },
    // Well short of the 40 ceiling: the gain flattens out long before that and
    // steps are billed individually.
    steps: 26,
    stepsKey: 'steps',
    guidance: 4.5,
    negativePrompt: false,
    reference: false,
  },
  'phoenix-1.0': {
    transport: 'json',
    output: 'binary',
    dimensions: { max: 2048 },
    steps: 25,
    stepsKey: 'num_steps',
    // Its guidance range starts at 2, unlike the others which start at 0.
    guidance: 3.5,
    negativePrompt: true,
    reference: false,
  },
  'flux-1-schnell': {
    transport: 'json',
    output: 'base64',
    // No width or height at all, so the requested aspect ratio cannot be
    // honoured and every cover comes back square.
    dimensions: null,
    // Documented maximum is 8. The code asked for 6, leaving quality on the
    // table for no saving worth having.
    steps: 8,
    stepsKey: 'steps',
    negativePrompt: false,
    reference: false,
  },
  'flux-2-dev': FLUX_2,
  'flux-2-klein-9b': { ...FLUX_2, steps: 8 },
  // Distilled to a fixed four steps; passing a step count is rejected.
  'flux-2-klein-4b': { ...FLUX_2, steps: null },
  'stable-diffusion-xl-base-1.0': STABLE_DIFFUSION,
  'stable-diffusion-xl-lightning': { ...STABLE_DIFFUSION, steps: 8 },
  'dreamshaper-8-lcm': STABLE_DIFFUSION,
};

export function profileFor(model: string): ModelProfile {
  return PROFILES[model.split('/').pop() ?? ''] ?? CONSERVATIVE;
}

/** Model ids this engine knows how to drive, for the admin presets. */
export const SUPPORTED_WORKERS_IMAGE_MODELS = Object.keys(PROFILES);

/**
 * Turns an aspect ratio into pixel dimensions.
 *
 * Held to roughly 1.3 megapixels and rounded to multiples of 32, which is what
 * diffusion models expect; an odd size is either rejected or quietly corrected
 * with a stretched result.
 */
export function dimensionsFor(
  aspectRatio: string | undefined,
  cap = 2500,
): { width: number; height: number } {
  const round32 = (value: number) => Math.max(512, Math.min(cap, Math.round(value / 32) * 32));
  const targetPixels = 1_310_720; // 1024 x 1280

  const match = /^(\d{1,2})\s*:\s*(\d{1,2})$/.exec((aspectRatio ?? '').trim());
  const w = match ? Number(match[1]) : 4;
  const h = match ? Number(match[2]) : 5;
  if (!w || !h) return { width: round32(1024), height: round32(1280) };

  const scale = Math.sqrt(targetPixels / (w * h));
  return { width: round32(w * scale), height: round32(h * scale) };
}

/**
 * Normalises every response shape the catalogue returns into bytes.
 *
 * Written defensively on purpose: the declared output of a given model has
 * changed under this code before, and guessing wrong surfaces as "no image data"
 * rather than as anything diagnosable.
 */
export async function toBytes(response: unknown): Promise<Uint8Array | null> {
  if (!response) return null;

  // `{ image: base64 }` — FLUX and Leonardo's Lucid Origin.
  const asObject = response as { image?: unknown };
  if (typeof asObject.image === 'string' && asObject.image.length > 0) {
    return decodeBase64(asObject.image);
  }

  if (response instanceof Uint8Array) return response;
  if (response instanceof ArrayBuffer) return new Uint8Array(response);
  if (typeof Blob !== 'undefined' && response instanceof Blob) {
    return new Uint8Array(await response.arrayBuffer());
  }

  // A `ReadableStream` of raw bytes — Stable Diffusion and Phoenix.
  const stream =
    response instanceof ReadableStream
      ? response
      : ((response as { body?: unknown }).body instanceof ReadableStream
          ? ((response as { body: ReadableStream }).body)
          : null);

  if (stream) {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value as Uint8Array;
      chunks.push(chunk);
      total += chunk.length;
    }
    if (total === 0) return null;
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  }

  return null;
}

/**
 * The JSON body for a model that takes one.
 *
 * Pure and exported so the payload can be pinned by tests. Most of these models
 * cannot be exercised on demand — both the Gemini free tier and the daily Neuron
 * allocation run out — so the request shape is the part worth asserting: a
 * mistyped field name fails identically to an exhausted quota.
 */
export function buildJsonInput(
  model: string,
  prompt: string,
  request: Pick<ImageRequest, 'aspectRatio' | 'negative'>,
): Record<string, unknown> {
  const profile = profileFor(model);
  const input: Record<string, unknown> = { prompt };

  if (profile.steps !== null) input[profile.stepsKey] = profile.steps;
  if (profile.dimensions) {
    const { width, height } = dimensionsFor(request.aspectRatio, profile.dimensions.max);
    input.width = width;
    input.height = height;
  }
  if (profile.guidance !== undefined) input.guidance = profile.guidance;
  if (profile.negativePrompt && request.negative) {
    input.negative_prompt = request.negative.slice(0, 600);
  }

  return input;
}

/**
 * The form fields for a FLUX.2 request, as string values.
 *
 * Split from the FormData assembly so the field names and values can be checked
 * without a binding. `input_image_0` is added separately because it is binary.
 */
export function buildFormFields(
  model: string,
  prompt: string,
  request: Pick<ImageRequest, 'aspectRatio'>,
): Record<string, string> {
  const profile = profileFor(model);
  const fields: Record<string, string> = { prompt };

  if (profile.steps !== null) fields[profile.stepsKey] = String(profile.steps);
  if (profile.dimensions) {
    const { width, height } = dimensionsFor(request.aspectRatio, profile.dimensions.max);
    fields.width = String(width);
    fields.height = String(height);
  }
  if (profile.guidance !== undefined) fields.guidance = String(profile.guidance);

  return fields;
}

export class WorkersAiEngine implements ImageEngine {
  readonly name: string;
  readonly supportsReference: boolean;

  private readonly profile: ModelProfile;

  /** The model id is configuration now, so it can be changed from the console. */
  constructor(private readonly model: string = DEFAULT_MODEL) {
    this.name = `workers-ai:${model.split('/').pop() ?? model}`;
    this.profile = profileFor(model);
    this.supportsReference = this.profile.reference;
  }

  async generate(request: ImageRequest): Promise<GeneratedImage> {
    const ai = useAi();
    if (!ai) {
      throw AppError.badRequest(
        'Workers AI is not bound to this Worker. Add "ai": { "binding": "AI" } to wrangler.jsonc and redeploy.',
      );
    }

    const profile = this.profile;
    const prompt = request.instruction.slice(0, MAX_PROMPT_CHARS);
    const useReference = Boolean(request.reference) && profile.reference;

    let response: unknown;
    try {
      response =
        profile.transport === 'multipart'
          ? await this.runMultipart(ai, prompt, request, useReference)
          : await this.runJson(ai, prompt, request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // The daily free allocation is the failure operators will actually hit, so
      // it is worth naming — but appended to the provider's own text, never in
      // place of it. Swallowing the original made a schema rejection and an
      // exhausted quota read identically, and only one of those is worth waiting
      // out.
      if (/neuron/i.test(message)) {
        // The allocation is account-wide, not per model: partner models such as
        // Lucid Origin are billed per image *and* metered against it, so
        // switching model does not buy a way round this. Documented to reset at
        // 00:00 UTC, though it has been observed staying exhausted past that, so
        // the dashboard is the only reliable answer on remaining usage.
        throw AppError.badRequest(
          `Workers AI refused the request for ${this.model}: the account's daily free allocation of 10,000 Neurons is exhausted. ` +
            `It covers every Workers AI model including the partner ones, so no other model will work either — use Gemini, or move the account to the Workers Paid plan. ` +
            `Provider detail: ${message}`,
        );
      }
      throw AppError.badRequest(`Workers AI failed for ${this.model}: ${message}`);
    }

    const bytes = await toBytes(response);
    if (!bytes) {
      throw AppError.badRequest(
        `${this.name} returned no usable image data. The model's response shape may have changed.`,
      );
    }

    return {
      bytes,
      // Storage re-sniffs the magic bytes, so this is only the declared type.
      mimeType: 'image/jpeg',
      engine: this.name,
      usedReference: useReference,
    };
  }

  /**
   * `request.negative` is only passed to models with a real field for it.
   *
   * Folding the list into the positive prompt is actively harmful for two
   * reasons. Diffusion models do not parse negation, so "avoid extra fingers"
   * reads as a request for fingers. And the safety classifier scores the whole
   * string: a negative list mentioning faces, limbs and skin is enough to trip
   * it, which is exactly what happened — an ordinary Diwali portrait came back
   * as "8007: Input prompt contains NSFW content".
   *
   * Where there is no such field, quality is defended positively in the
   * instruction itself (see QUALITY_CLAUSE in covers.ts).
   */
  private async runJson(ai: unknown, prompt: string, request: ImageRequest): Promise<unknown> {
    return await (ai as { run: (model: string, input: unknown) => Promise<unknown> }).run(
      this.model,
      buildJsonInput(this.model, prompt, request),
    );
  }

  /**
   * The FLUX.2 calling convention: form fields, streamed in.
   *
   * The body has to be handed over as a stream with its generated content type,
   * which is why the FormData is routed through a throwaway `Request` — that is
   * the only way to have the boundary parameter computed for us. Cloudflare's own
   * example does the same and flags it as temporary.
   */
  private async runMultipart(
    ai: unknown,
    prompt: string,
    request: ImageRequest,
    useReference: boolean,
  ): Promise<unknown> {
    const form = new FormData();
    for (const [key, value] of Object.entries(buildFormFields(this.model, prompt, request))) {
      form.append(key, value);
    }

    // Indexed field name is required — `input_image_0`, not `image`. The model
    // rejects references larger than 512x512, and there is no resize step in the
    // Worker, so an oversized house model will fail here and fall through to the
    // other provider with the reason recorded.
    if (useReference && request.reference) {
      form.append(
        'input_image_0',
        new Blob([new Uint8Array(request.reference.bytes)], { type: request.reference.mimeType }),
      );
    }

    const formRequest = new Request('http://dummy', { method: 'POST', body: form });

    return await (ai as { run: (model: string, input: unknown) => Promise<unknown> }).run(
      this.model,
      {
        multipart: {
          body: formRequest.body,
          contentType: formRequest.headers.get('content-type') ?? 'multipart/form-data',
        },
      },
    );
  }
}
