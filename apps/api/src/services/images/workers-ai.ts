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

/** Fallback when nothing is configured; matches the previously hardcoded id. */
const DEFAULT_MODEL = '@cf/black-forest-labs/flux-1-schnell';

/** flux-1-schnell caps the prompt; longer text is silently truncated upstream. */
const MAX_PROMPT_CHARS = 2000;

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

    // `request.negative` is deliberately discarded.
    //
    // flux-1-schnell has no negative-prompt field, and folding the list into the
    // positive prompt is actively harmful for two reasons. Diffusion models do
    // not parse negation, so "avoid extra fingers" reads as a request for
    // fingers. And the safety classifier scores the whole string: a negative
    // list mentioning faces, limbs and skin is enough to trip it, which is
    // exactly what happened — an ordinary Diwali portrait came back as
    // "8007: Input prompt contains NSFW content".
    //
    // Quality is instead defended positively, in the instruction itself (see
    // QUALITY_CLAUSE in covers.ts).
    const prompt = request.instruction.slice(0, MAX_PROMPT_CHARS);

    let response: unknown;
    try {
      response = await (ai as { run: (model: string, input: unknown) => Promise<unknown> }).run(
        this.model,
        { prompt, steps: 6 },
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
