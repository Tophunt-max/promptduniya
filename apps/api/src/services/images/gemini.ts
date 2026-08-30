import { config } from '../../lib/env';
import { AppError } from '../../lib/errors';
import {
  decodeBase64,
  encodeBase64,
  type GeneratedImage,
  type ImageEngine,
  type ImageRequest,
} from './types';

/**
 * Google Gemini image generation ("nano banana").
 *
 * Preferred over Workers AI for two reasons. First, it accepts a reference image,
 * so a photo-edit prompt's cover can be produced the same way a reader will
 * produce theirs — by handing the model a face to preserve. Second, every
 * photo-edit prompt in the catalogue was written *for* Gemini, so a cover made
 * by any other model is showing the reader something they will not get.
 *
 * Works on the free tier: an AI Studio key with no billing attached allows a few
 * hundred images a day, which is more than a full catalogue backfill needs. The
 * same code path serves the paid tier — only the key changes.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-2.5-flash-image';

/**
 * Gemini accepts camelCase on the way in but has shipped both spellings on the
 * way out, so both are declared on one shape rather than as a union — a union
 * would force a discriminant check at every read for no benefit.
 */
interface InlineData {
  mimeType?: string;
  mime_type?: string;
  data?: string;
}

interface GeminiPart {
  text?: string;
  inlineData?: InlineData;
  inline_data?: InlineData;
}

export class GeminiImageEngine implements ImageEngine {
  readonly name = `gemini:${MODEL}`;
  readonly supportsReference = true;

  async generate(request: ImageRequest): Promise<GeneratedImage> {
    const c = config();
    if (!c.aiApiKey) {
      throw AppError.badRequest(
        'AI_API_KEY is not set. Create a free key at aistudio.google.com/apikey and store it with `wrangler secret put AI_API_KEY`.',
      );
    }

    const parts: GeminiPart[] = [];
    // Reference first: Gemini weights earlier parts more heavily, and the face
    // is the thing that must survive.
    if (request.reference) {
      parts.push({
        inlineData: {
          mimeType: request.reference.mimeType,
          data: encodeBase64(request.reference.bytes),
        },
      });
    }
    parts.push({ text: this.buildText(request) });

    const response = await fetch(`${BASE}/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': c.aiApiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['IMAGE'], temperature: 0.85 },
      }),
      // Image generation is slow; well beyond the 20s the text engine allows.
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      if (response.status === 429) {
        throw AppError.badRequest(
          'Gemini rate limit reached. The free tier allows a few hundred images a day — wait and retry, or switch IMAGE_PROVIDER to "workers-ai".',
        );
      }
      throw AppError.badRequest(`Gemini responded ${response.status}: ${detail.slice(0, 300)}`);
    }

    const body = (await response.json()) as {
      candidates?: { content?: { parts?: GeminiPart[] } }[];
    };

    for (const part of body.candidates?.[0]?.content?.parts ?? []) {
      const inline = part.inlineData ?? part.inline_data;
      const data = inline?.data;
      if (!data) continue;
      return {
        bytes: decodeBase64(data),
        mimeType: inline?.mimeType ?? inline?.mime_type ?? 'image/png',
        engine: this.name,
        usedReference: Boolean(request.reference),
      };
    }

    throw AppError.badRequest(
      'Gemini returned no image. This usually means the instruction tripped a safety filter.',
    );
  }

  /**
   * Gemini takes no separate negative prompt, and it responds better to a
   * positive restatement than to a bare list of banned things — so the negatives
   * are appended as an explicit avoid clause rather than a parallel field.
   */
  private buildText(request: ImageRequest): string {
    const lines = [request.instruction];
    if (request.aspectRatio) {
      lines.push(`Output a single image in a ${request.aspectRatio} vertical frame.`);
    }
    if (request.negative) {
      lines.push(`Do not include any of the following: ${request.negative}`);
    }
    return lines.join('\n\n');
  }
}
