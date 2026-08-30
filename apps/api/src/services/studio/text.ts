import { useAi } from '@pd/db';

import { config } from '../../lib/env';
import { AppError } from '../../lib/errors';

/**
 * Text completion for the content studio.
 *
 * A deliberately smaller contract than `GeneratorEngine` in
 * services/generator: that one is shaped around a `GeneratorInput` form and
 * returns a four-field result for the public generator page. The studio needs
 * something lower level — hand over a system instruction and a user message,
 * get JSON back — so it gets its own primitive rather than bending the other
 * one out of shape.
 *
 * Three providers, chosen by TEXT_PROVIDER:
 *
 *   workers-ai  Llama on Cloudflare. No key, no card, 10,000 free Neurons a
 *               day. The default, so the pipeline runs on a bare deployment.
 *   gemini      Best instruction-following of the three, and already the
 *               provider the image side prefers. Needs AI_API_KEY.
 *   openai      Needs OPENAI_API_KEY.
 *
 * All three fall back to one another, because the failure everyone actually
 * hits is a daily quota and the three quotas are separate budgets.
 */

export interface TextEngine {
  readonly name: string;
  /** Returns the model's raw reply. Callers parse it. */
  complete(input: { system: string; user: string; maxTokens?: number }): Promise<string>;
}

/* ------------------------------ Cloudflare -------------------------------- */

/**
 * Candidate models, tried in order.
 *
 * A list rather than a constant because Cloudflare retires models on a schedule
 * and the binding gives no warning until a call fails. The first version of this
 * pinned `@cf/meta/llama-3.1-8b-instruct` and broke immediately in production:
 *
 *   5028: @cf/meta/infire-llama-3.1-8b-instruct was deprecated on 2026-05-30
 *
 * A deprecation now costs one wasted call and moves to the next entry, instead
 * of taking the whole studio down until someone edits this file. Ordered fastest
 * capable first: prompt writing is a formatting job more than a reasoning one.
 */
const WORKERS_TEXT_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/zai-org/glm-4.7-flash',
  '@cf/google/gemma-4-26b-a4b-it',
];

/** Deprecated or unknown model — worth retrying with a different one. */
function isModelGoneError(message: string): boolean {
  return /deprecat|5028|no such model|not found|unsupported model/i.test(message);
}

/**
 * Extracts the reply text from a Workers AI response.
 *
 * Necessary because the shape is not consistent across the catalogue. The older
 * Llama models answer `{ response: "..." }`, while the newer chat models return
 * an OpenAI-compatible envelope. Assuming the first shape cost a production
 * failure — `TypeError: raw.trim is not a function` — when `.response` came back
 * as an object and was passed straight to the JSON parser.
 *
 * Returns null rather than throwing so the caller can try the next model.
 */
function pickText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;

  if (typeof record.response === 'string') return record.response;
  if (typeof record.output_text === 'string') return record.output_text;

  // OpenAI-compatible envelope.
  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    if (typeof message?.content === 'string') return message.content;
    if (typeof first?.text === 'string') return first.text;
  }

  // Some models nest the whole thing one level deeper.
  if (record.result && typeof record.result === 'object') return pickText(record.result);
  if (record.response && typeof record.response === 'object') return pickText(record.response);

  return null;
}

export class WorkersAiTextEngine implements TextEngine {
  readonly name = 'workers-ai';

  async complete(input: { system: string; user: string; maxTokens?: number }): Promise<string> {
    const ai = useAi();
    if (!ai) {
      throw AppError.badRequest(
        'Workers AI is not bound to this Worker. Add "ai": { "binding": "AI" } to wrangler.jsonc and redeploy.',
      );
    }

    const run = (ai as { run: (model: string, body: unknown) => Promise<unknown> }).run.bind(ai);
    let lastError = '';

    for (const model of WORKERS_TEXT_MODELS) {
      try {
        const response = await run(model, {
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.user },
          ],
          max_tokens: input.maxTokens ?? 1600,
          temperature: 0.85,
        });

        const text = pickText(response);
        if (text) return text;
        lastError = `${model} returned a reply in an unrecognised shape`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastError = message;

        // The quota is account-wide, so trying another model cannot help.
        if (/neuron/i.test(message)) {
          throw AppError.badRequest(
            'Workers AI daily free allocation is used up. It resets at 00:00 UTC, or set TEXT_PROVIDER to "gemini" / "openai".',
          );
        }
        if (!isModelGoneError(message)) {
          throw AppError.badRequest(`Workers AI text generation failed: ${message}`);
        }
        console.warn(`[studio] ${model} unavailable, trying the next candidate: ${message}`);
      }
    }

    throw AppError.badRequest(
      `No Workers AI text model was usable. Last error: ${lastError.slice(0, 200)}`,
    );
  }
}

/* -------------------------------- Gemini ---------------------------------- */

export class GeminiTextEngine implements TextEngine {
  readonly name = 'gemini:gemini-2.0-flash';

  async complete(input: { system: string; user: string; maxTokens?: number }): Promise<string> {
    const c = config();
    if (!c.aiApiKey) {
      throw AppError.badRequest(
        'AI_API_KEY is not set. Create a free key at aistudio.google.com/apikey.',
      );
    }

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': c.aiApiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: 'user', parts: [{ text: input.user }] }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: input.maxTokens ?? 2000,
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      if (response.status === 429) {
        throw AppError.badRequest('Gemini rate limit reached. Wait a minute, or switch provider.');
      }
      throw AppError.badRequest(`Gemini responded ${response.status}: ${detail.slice(0, 240)}`);
    }

    const body = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw AppError.badRequest('Gemini returned an empty reply');
    return text;
  }
}

/* -------------------------------- OpenAI ---------------------------------- */

export class OpenAiTextEngine implements TextEngine {
  readonly name = 'openai:gpt-4o-mini';

  async complete(input: { system: string; user: string; maxTokens?: number }): Promise<string> {
    const c = config();
    if (!c.openaiApiKey) {
      throw AppError.badRequest(
        'OPENAI_API_KEY is not set. Store it with `wrangler secret put OPENAI_API_KEY`.',
      );
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${c.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        temperature: 0.9,
        max_tokens: input.maxTokens ?? 2000,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw AppError.badRequest(`OpenAI responded ${response.status}: ${detail.slice(0, 240)}`);
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content;
    if (!text) throw AppError.badRequest('OpenAI returned an empty reply');
    return text;
  }
}

/* ------------------------------- Resolution ------------------------------- */

class ResilientTextEngine implements TextEngine {
  readonly name: string;

  constructor(
    private readonly primary: TextEngine,
    private readonly fallbacks: TextEngine[],
  ) {
    this.name = primary.name;
  }

  async complete(input: { system: string; user: string; maxTokens?: number }): Promise<string> {
    try {
      return await this.primary.complete(input);
    } catch (error) {
      for (const fallback of this.fallbacks) {
        try {
          console.warn(
            `[studio] ${this.primary.name} failed, trying ${fallback.name}:`,
            error instanceof Error ? error.message : error,
          );
          return await fallback.complete(input);
        } catch {
          /* try the next one */
        }
      }
      throw error;
    }
  }
}

function available(): { workers: boolean; gemini: boolean; openai: boolean } {
  const c = config();
  return {
    workers: Boolean(useAi()),
    gemini: Boolean(c.aiApiKey),
    openai: Boolean(c.openaiApiKey),
  };
}

export function resolveTextEngine(): TextEngine {
  const c = config();
  const has = available();

  const build = (id: string): TextEngine | null => {
    if (id === 'workers-ai' && has.workers) return new WorkersAiTextEngine();
    if (id === 'gemini' && has.gemini) return new GeminiTextEngine();
    if (id === 'openai' && has.openai) return new OpenAiTextEngine();
    return null;
  };

  // Preference order: whatever is configured, then the rest as fallbacks.
  const order = [c.textProvider, 'gemini', 'openai', 'workers-ai'];
  const engines = order
    .map(build)
    .filter((engine): engine is TextEngine => engine !== null)
    // De-duplicate by name so a provider named twice is not tried twice.
    .filter((engine, index, all) => all.findIndex((e) => e.name === engine.name) === index);

  const primary = engines[0];
  if (!primary) {
    throw AppError.badRequest(
      'No text provider available. Bind Workers AI ("ai": { "binding": "AI" }), or set AI_API_KEY / OPENAI_API_KEY.',
    );
  }
  return new ResilientTextEngine(primary, engines.slice(1));
}

export function textProviderStatus(): {
  provider: string;
  workersAi: boolean;
  gemini: boolean;
  openai: boolean;
} {
  const c = config();
  const has = available();
  return {
    provider: c.textProvider,
    workersAi: has.workers,
    gemini: has.gemini,
    openai: has.openai,
  };
}
