import { useAi } from '@pd/db';
import type { TextProvider } from '@pd/shared';

import { AppError } from '../../lib/errors';
import { getAiConfig, type AiRuntimeConfig } from '../ai-providers';

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
 * Three providers, chosen by the `ai.text_provider` setting:
 *
 *   workers-ai  Llama on Cloudflare. No key, no card, 10,000 free Neurons a
 *               day. The default, so the pipeline runs on a bare deployment.
 *   gemini      Best instruction-following of the three, and already the
 *               provider the image side prefers.
 *   openai      Needs an OpenAI key.
 *
 * All three fall back to one another, because the failure everyone actually
 * hits is a daily quota and the three quotas are separate budgets.
 *
 * Models and keys are configuration, not constants. Each engine now takes them
 * through its constructor instead of reading a hardcoded literal and calling
 * `config()` for the key, so both are settable from the admin console. See
 * services/ai-providers.ts.
 */

export interface TextEngine {
  readonly name: string;
  /** Returns the model's raw reply. Callers parse it. */
  complete(input: { system: string; user: string; maxTokens?: number }): Promise<string>;
}

/* ------------------------------ Cloudflare -------------------------------- */

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
  readonly name: string;

  /**
   * Candidate models, tried in order.
   *
   * A list rather than a single id because Cloudflare retires models on a
   * schedule and the binding gives no warning until a call fails. The first
   * version of this pinned `@cf/meta/llama-3.1-8b-instruct` and broke
   * immediately in production:
   *
   *   5028: @cf/meta/infire-llama-3.1-8b-instruct was deprecated on 2026-05-30
   *
   * A deprecation now costs one wasted call and moves to the next entry. The
   * chain is editable from the console, so recovering from the next deprecation
   * no longer needs a code change at all.
   */
  constructor(private readonly models: string[]) {
    this.name = `workers-ai:${models[0] ?? 'none'}`;
  }

  async complete(input: { system: string; user: string; maxTokens?: number }): Promise<string> {
    const ai = useAi();
    if (!ai) {
      throw AppError.badRequest(
        'Workers AI is not bound to this Worker. Add "ai": { "binding": "AI" } to wrangler.jsonc and redeploy.',
      );
    }
    if (this.models.length === 0) {
      throw AppError.badRequest('No Workers AI text model is configured.');
    }

    const run = (ai as { run: (model: string, body: unknown) => Promise<unknown> }).run.bind(ai);
    let lastError = '';

    for (const model of this.models) {
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
            'Workers AI daily free allocation is used up. It resets at 00:00 UTC, or switch the text provider to Gemini or OpenAI on the AI providers screen.',
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

/**
 * Extra output allowance for a model that reasons before answering.
 *
 * `maxOutputTokens` is a single budget covering the model's internal reasoning
 * and the text it returns, and reasoning routinely runs to a few thousand tokens
 * on a task that asks for a JSON object. Every call site here sizes its budget
 * for the answer, so the engine adds the reasoning allowance rather than making
 * each caller guess at it.
 */
const GEMINI_THINKING_HEADROOM = 6000;

export class GeminiTextEngine implements TextEngine {
  readonly name: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.name = `gemini:${model}`;
  }

  async complete(input: { system: string; user: string; maxTokens?: number }): Promise<string> {
    if (!this.apiKey) {
      throw AppError.badRequest(
        'No Gemini API key is configured. Add one on the AI providers screen, or create a free key at aistudio.google.com/apikey.',
      );
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        this.model,
      )}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: 'user', parts: [{ text: input.user }] }],
          generationConfig: {
            temperature: 0.9,
            // Call sites budget for the *answer*. Current Gemini models reason
            // first and bill that reasoning against the same ceiling, so passing
            // the answer budget straight through starved the reply: at 1200 the
            // trend expansion got truncated JSON that parsed to nothing, and the
            // pipeline logged a healthy-looking run that produced zero themes.
            // The headroom is deliberately generous — unused reasoning tokens
            // cost nothing, whereas a truncated JSON reply costs the whole call.
            maxOutputTokens: (input.maxTokens ?? 2000) + GEMINI_THINKING_HEADROOM,
            responseMimeType: 'application/json',
            // No `thinkingConfig` here, deliberately.
            //
            // Asking for `thinkingBudget: 0` does cut latency roughly fourfold
            // where it is accepted, but `gemini-3.6-flash` rejects the whole
            // request with a bare 400 INVALID_ARGUMENT — Google moved this
            // control between model generations and the older spelling is no
            // longer valid. Trading a working pipeline for a faster one is not a
            // trade worth making on a cron-driven job, and the headroom above is
            // what actually fixed the truncated replies: with it and no
            // thinkingConfig, trend expansion returns a full set of themes.
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
      // A 404 here is almost always a model id that does not exist, and the raw
      // provider message does not say so clearly.
      if (response.status === 404) {
        throw AppError.badRequest(
          `Gemini does not recognise the model "${this.model}". Check the model id on the AI providers screen.`,
        );
      }
      throw AppError.badRequest(`Gemini responded ${response.status}: ${detail.slice(0, 240)}`);
    }

    const body = (await response.json()) as {
      candidates?: {
        content?: { parts?: { text?: string; thought?: boolean }[] };
        finishReason?: string;
      }[];
      usageMetadata?: { thoughtsTokenCount?: number; candidatesTokenCount?: number };
    };

    const candidate = body.candidates?.[0];

    // Every part, not just the first, and skipping the ones flagged as thoughts.
    // Current Gemini models reason before answering and split the reply across
    // parts; reading `parts[0].text` alone returned undefined whenever the first
    // part was a thought, which read as "empty reply" from a working model.
    const text = (candidate?.content?.parts ?? [])
      .filter((part) => !part.thought && typeof part.text === 'string')
      .map((part) => part.text as string)
      .join('')
      .trim();

    if (!text) {
      // `finishReason` is the difference between a token budget spent on
      // reasoning and a safety block, and the generic message hid both. On these
      // models `maxOutputTokens` is a shared budget covering thinking *and* the
      // answer, so MAX_TOKENS here means the budget was too small rather than
      // the output being too long.
      const reason = candidate?.finishReason ?? 'unknown';
      const thoughts = body.usageMetadata?.thoughtsTokenCount ?? 0;

      if (reason === 'MAX_TOKENS') {
        throw AppError.badRequest(
          `Gemini spent its whole token budget (${input.maxTokens ?? 2000}) on reasoning and returned no answer` +
            (thoughts ? ` — ${thoughts} thinking tokens` : '') +
            `. Raise the budget or pick a model that does not think before replying.`,
        );
      }
      throw AppError.badRequest(`Gemini returned an empty reply (finishReason: ${reason})`);
    }

    return text;
  }
}

/* -------------------------------- OpenAI ---------------------------------- */

export class OpenAiTextEngine implements TextEngine {
  readonly name: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.name = `openai:${model}`;
  }

  async complete(input: { system: string; user: string; maxTokens?: number }): Promise<string> {
    if (!this.apiKey) {
      throw AppError.badRequest(
        'No OpenAI API key is configured. Add one on the AI providers screen.',
      );
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
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
      if (response.status === 404) {
        throw AppError.badRequest(
          `OpenAI does not recognise the model "${this.model}". Check the model id on the AI providers screen.`,
        );
      }
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

/**
 * Builds one engine, or null when it cannot run.
 *
 * Exported because the provider test endpoint needs to exercise a single named
 * provider rather than the resolved fallback chain — testing "gemini" and
 * silently getting a Workers AI answer would make the test worthless.
 */
export function buildTextEngine(
  provider: TextProvider,
  c: AiRuntimeConfig,
): TextEngine | null {
  if (provider === 'workers-ai') {
    return useAi() ? new WorkersAiTextEngine(c.workersTextModels) : null;
  }
  if (provider === 'gemini') {
    return c.geminiApiKey ? new GeminiTextEngine(c.geminiApiKey, c.geminiTextModel) : null;
  }
  if (provider === 'openai') {
    return c.openaiApiKey ? new OpenAiTextEngine(c.openaiApiKey, c.openaiTextModel) : null;
  }
  return null;
}

/**
 * The configured engine, with the other two behind it as fallbacks.
 *
 * Async now because the configuration lives in the database. Every caller was
 * already inside an async function, so this costs nothing at the call sites.
 */
export async function resolveTextEngine(): Promise<TextEngine> {
  const c = await getAiConfig();

  // Preference order: whatever is configured, then the rest as fallbacks.
  const order: TextProvider[] = [c.textProvider, 'gemini', 'openai', 'workers-ai'];

  const engines = order
    .map((provider) => buildTextEngine(provider, c))
    .filter((engine): engine is TextEngine => engine !== null)
    // De-duplicate by name so a provider named twice is not tried twice.
    .filter((engine, index, all) => all.findIndex((e) => e.name === engine.name) === index);

  const primary = engines[0];
  if (!primary) {
    throw AppError.badRequest(
      'No text provider is available. Add a Gemini or OpenAI key on the AI providers screen, or bind Workers AI ("ai": { "binding": "AI" }).',
    );
  }
  return new ResilientTextEngine(primary, engines.slice(1));
}

export async function textProviderStatus(): Promise<{
  provider: string;
  workersAi: boolean;
  gemini: boolean;
  openai: boolean;
  model: string;
}> {
  const c = await getAiConfig();
  return {
    provider: c.textProvider,
    workersAi: Boolean(useAi()),
    gemini: Boolean(c.geminiApiKey),
    openai: Boolean(c.openaiApiKey),
    model:
      c.textProvider === 'gemini'
        ? c.geminiTextModel
        : c.textProvider === 'openai'
          ? c.openaiTextModel
          : (c.workersTextModels[0] ?? 'none'),
  };
}
