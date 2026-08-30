import {
  AI_SETTING_KEYS,
  GENERATOR_PROVIDERS,
  IMAGE_PROVIDERS,
  TEXT_PROVIDERS,
  type GeneratorProvider,
  type ImageProvider,
  type TextProvider,
} from '@pd/shared';
import { useAi } from '@pd/db';

import { config } from '../lib/env';
import { AppError } from '../lib/errors';
import { getSettings, setSettings, type SettingValue } from './settings';

/**
 * AI provider configuration.
 *
 * Everything about which model runs and which key it runs with used to be fixed
 * at deploy time: providers were `wrangler.jsonc` vars, keys were Worker secrets
 * set through the CLI, and every model id was a string literal in the engine that
 * used it. So there was no way to enter an API key from the console, no way to
 * switch provider without a redeploy, and no way to change model at all.
 *
 * This resolves all three from `site_settings`, falling back to the environment.
 *
 * Key precedence, and why
 * -----------------------
 * A key saved here **overrides** the environment secret. The alternative — env
 * always wins — produces the worst possible experience: an operator pastes a key,
 * the screen accepts it, and nothing changes because a secret they cannot see is
 * quietly taking priority. Overriding is the more explicit action, and
 * `keySource` in the status payload names which one is live so the UI never has
 * to guess.
 *
 * Secrets are write-only. `aiProviderStatus()` returns whether a key is present
 * and its last four characters, never the value, and the two key settings are on
 * a deny-list that `GET /v1/admin/settings` redacts.
 *
 * Model ids are free text with presets as suggestions. A closed enum would rot:
 * this codebase already lost production time to a pinned Workers AI model being
 * deprecated, and the fix should be typing a new id, not shipping a release.
 */

/* -------------------------------- Presets --------------------------------- */

export interface ModelPreset {
  id: string;
  label: string;
  note?: string;
}

/**
 * Suggested models per provider.
 *
 * Deliberately short and deliberately not authoritative — a provider's catalogue
 * changes faster than this file will. The UI offers these as one-click fills next
 * to a text box that accepts anything.
 */
export const TEXT_MODEL_PRESETS: Record<TextProvider, ModelPreset[]> = {
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', note: 'Fast, generous free tier' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'Newer, still cheap' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'Best at following the JSON contract' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini', note: 'Cheapest usable option' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
  ],
  'workers-ai': [
    { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B (fast)' },
    { id: '@cf/zai-org/glm-4.7-flash', label: 'GLM 4.7 Flash' },
    { id: '@cf/google/gemma-4-26b-a4b-it', label: 'Gemma 4 26B' },
  ],
};

export const IMAGE_MODEL_PRESETS: Record<'gemini' | 'workers-ai', ModelPreset[]> = {
  gemini: [
    {
      id: 'gemini-2.5-flash-image',
      label: 'Gemini 2.5 Flash Image',
      note: 'Accepts a reference face — required for photo-edit covers. Legacy, but free tier',
    },
    {
      id: 'gemini-3.1-flash-image-preview',
      label: 'Gemini 3.1 Flash Image',
      note: 'Current fast image model. Also accepts a reference face',
    },
    {
      id: 'gemini-3-pro-image',
      label: 'Gemini 3 Pro Image',
      note: 'Highest quality Google offers. Paid tier only',
    },
  ],
  'workers-ai': [
    {
      id: '@cf/black-forest-labs/flux-2-dev',
      label: 'FLUX.2 dev',
      note: 'Highest fidelity here, and the only Workers AI model that can hold a face for photo-edit covers. Slowest',
    },
    {
      id: '@cf/black-forest-labs/flux-2-klein-9b',
      label: 'FLUX.2 klein 9B',
      note: 'Distilled FLUX.2 — most of the quality, far quicker. Takes a reference face',
    },
    {
      id: '@cf/black-forest-labs/flux-2-klein-4b',
      label: 'FLUX.2 klein 4B',
      note: 'Fastest FLUX.2. Fixed at 4 steps, so quality is not tunable',
    },
    {
      id: '@cf/leonardo/lucid-origin',
      label: 'Lucid Origin (Leonardo)',
      note: 'Excellent realism and prompt adherence. Honours the 4:5 frame. Billed per image',
    },
    {
      id: '@cf/leonardo/phoenix-1.0',
      label: 'Phoenix 1.0 (Leonardo)',
      note: 'Strong prompt adherence, cheaper than Lucid Origin. Accepts a negative prompt',
    },
    {
      id: '@cf/lykon/dreamshaper-8-lcm',
      label: 'DreamShaper 8 LCM',
      note: 'Stable Diffusion tuned for photorealism. Free allowance, older and lower resolution',
    },
    {
      id: '@cf/black-forest-labs/flux-1-schnell',
      label: 'FLUX.1 schnell',
      note: 'Cheapest, inside the free Neuron allowance. Square only, visibly softer faces',
    },
    {
      id: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
      label: 'SDXL base 1.0',
      note: 'Free allowance. Accepts a negative prompt',
    },
    {
      id: '@cf/bytedance/stable-diffusion-xl-lightning',
      label: 'SDXL Lightning',
      note: 'Free allowance, 8 steps — quickest of the Stable Diffusion options',
    },
  ],
};

/* --------------------------------- Defaults -------------------------------- */

/**
 * Fallbacks used until an operator sets something explicitly.
 *
 * These have to track the providers' live catalogues, which is the whole reason
 * model ids are free text here. `gemini-2.0-flash` sat in this list after Google
 * retired it, so a fresh install defaulted to a model that answers every request
 * with a 404 — and the image default was the oldest and softest model available
 * rather than the best one.
 */
export const AI_DEFAULTS = {
  geminiTextModel: 'gemini-3.6-flash',
  openaiTextModel: 'gpt-4o-mini',
  workersTextModels: [
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    '@cf/zai-org/glm-4.7-flash',
    '@cf/google/gemma-4-26b-a4b-it',
  ],
  geminiImageModel: 'gemini-2.5-flash-image',
  // Lucid Origin over flux-1-schnell. schnell is a distilled 8-step model with
  // no dimension control: it renders portrait skin flat and plastic and always
  // returns a square, which is what made generated covers look unusable next to
  // the prompt they were illustrating. Lucid Origin is billed per image rather
  // than drawn from the free Neuron allowance — a deliberate trade, since a
  // cover is the one image a reader judges the prompt by.
  workersImageModel: '@cf/leonardo/lucid-origin',
} as const;

/* -------------------------------- Resolution ------------------------------- */

export type KeySource = 'settings' | 'environment' | 'none';

export interface AiRuntimeConfig {
  textProvider: TextProvider;
  imageProvider: ImageProvider;
  generatorProvider: GeneratorProvider;

  geminiApiKey: string;
  openaiApiKey: string;
  geminiKeySource: KeySource;
  openaiKeySource: KeySource;

  geminiTextModel: string;
  openaiTextModel: string;
  /** Tried in order; Workers AI retires models without warning. */
  workersTextModels: string[];

  geminiImageModel: string;
  workersImageModel: string;
}

function pickString(value: SettingValue | undefined, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function pickOption<T extends string>(
  value: SettingValue | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return (allowed as readonly string[]).includes(candidate) ? (candidate as T) : fallback;
}

/**
 * Parses the Workers AI fallback chain.
 *
 * Stored as one comma-separated string rather than a JSON array so the settings
 * table stays uniformly scalar and the input stays a single text box. Falls back
 * to the built-in chain rather than to an empty list, because an empty list would
 * disable Workers AI while the console still showed it selected.
 */
function parseModelList(value: SettingValue | undefined, fallback: readonly string[]): string[] {
  if (typeof value !== 'string') return [...fallback];
  const parsed = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [...fallback];
}

/**
 * The live AI configuration.
 *
 * Reads settings once and merges the environment underneath. Callers that need a
 * key get the real value; anything user-facing must go through
 * `aiProviderStatus()` instead.
 */
export async function getAiConfig(): Promise<AiRuntimeConfig> {
  const s = await getSettings();
  const env = config();
  const K = AI_SETTING_KEYS;

  const storedGemini = pickString(s[K.geminiApiKey], '');
  const storedOpenai = pickString(s[K.openaiApiKey], '');

  const geminiApiKey = storedGemini || env.aiApiKey;
  const openaiApiKey = storedOpenai || env.openaiApiKey;

  return {
    // The environment value seeds the default, so an existing deployment keeps
    // behaving exactly as its wrangler.jsonc says until someone changes it here.
    textProvider: pickOption(
      s[K.textProvider],
      TEXT_PROVIDERS,
      pickOption(env.textProvider, TEXT_PROVIDERS, 'workers-ai'),
    ),
    imageProvider: pickOption(
      s[K.imageProvider],
      IMAGE_PROVIDERS,
      pickOption(env.imageProvider, IMAGE_PROVIDERS, 'workers-ai'),
    ),
    generatorProvider: pickOption(
      s[K.generatorProvider],
      GENERATOR_PROVIDERS,
      pickOption(env.aiProvider, GENERATOR_PROVIDERS, 'template'),
    ),

    geminiApiKey,
    openaiApiKey,
    geminiKeySource: storedGemini ? 'settings' : env.aiApiKey ? 'environment' : 'none',
    openaiKeySource: storedOpenai ? 'settings' : env.openaiApiKey ? 'environment' : 'none',

    geminiTextModel: pickString(s[K.geminiTextModel], AI_DEFAULTS.geminiTextModel),
    openaiTextModel: pickString(s[K.openaiTextModel], AI_DEFAULTS.openaiTextModel),
    workersTextModels: parseModelList(s[K.workersTextModels], AI_DEFAULTS.workersTextModels),

    geminiImageModel: pickString(s[K.geminiImageModel], AI_DEFAULTS.geminiImageModel),
    workersImageModel: pickString(s[K.workersImageModel], AI_DEFAULTS.workersImageModel),
  };
}

/* ---------------------------------- Status --------------------------------- */

/** Last four characters, so an operator can tell which key is installed. */
function hint(key: string): string | null {
  if (!key) return null;
  return key.length <= 4 ? '••••' : `••••${key.slice(-4)}`;
}

export interface AiProviderStatus {
  textProvider: TextProvider;
  imageProvider: ImageProvider;
  generatorProvider: GeneratorProvider;

  models: {
    geminiText: string;
    openaiText: string;
    workersText: string[];
    geminiImage: string;
    workersImage: string;
  };

  keys: {
    gemini: { configured: boolean; source: KeySource; hint: string | null };
    openai: { configured: boolean; source: KeySource; hint: string | null };
  };

  /** Whether each provider could actually run right now. */
  readiness: {
    workersAi: boolean;
    gemini: boolean;
    openai: boolean;
  };

  /** True when the selected text and image providers can both run. */
  ready: boolean;
  /** Only Gemini can preserve an uploaded face on a photo-edit cover. */
  supportsReferenceImages: boolean;
  presets: {
    text: Record<string, ModelPreset[]>;
    image: Record<string, ModelPreset[]>;
  };
}

/**
 * Everything the AI settings screen needs, with no secret in it.
 *
 * This is the only shape that may be returned to a client. `getAiConfig()` holds
 * the real keys and must never be serialised.
 */
export async function aiProviderStatus(): Promise<AiProviderStatus> {
  const c = await getAiConfig();
  const workersAi = Boolean(useAi());

  const readiness = {
    workersAi,
    gemini: Boolean(c.geminiApiKey),
    openai: Boolean(c.openaiApiKey),
  };

  const textReady =
    c.textProvider === 'workers-ai'
      ? readiness.workersAi
      : c.textProvider === 'gemini'
        ? readiness.gemini
        : readiness.openai;

  const imageReady =
    c.imageProvider === 'none'
      ? true
      : c.imageProvider === 'gemini'
        ? readiness.gemini
        : readiness.workersAi;

  return {
    textProvider: c.textProvider,
    imageProvider: c.imageProvider,
    generatorProvider: c.generatorProvider,
    models: {
      geminiText: c.geminiTextModel,
      openaiText: c.openaiTextModel,
      workersText: c.workersTextModels,
      geminiImage: c.geminiImageModel,
      workersImage: c.workersImageModel,
    },
    keys: {
      gemini: {
        configured: Boolean(c.geminiApiKey),
        source: c.geminiKeySource,
        hint: hint(c.geminiApiKey),
      },
      openai: {
        configured: Boolean(c.openaiApiKey),
        source: c.openaiKeySource,
        hint: hint(c.openaiApiKey),
      },
    },
    readiness,
    ready: textReady && imageReady,
    supportsReferenceImages: c.imageProvider === 'gemini' && readiness.gemini,
    presets: { text: TEXT_MODEL_PRESETS, image: IMAGE_MODEL_PRESETS },
  };
}

/* ---------------------------------- Writes --------------------------------- */

export interface AiConfigPatch {
  textProvider?: string;
  imageProvider?: string;
  generatorProvider?: string;
  geminiTextModel?: string;
  openaiTextModel?: string;
  workersTextModels?: string;
  geminiImageModel?: string;
  workersImageModel?: string;
  /** Empty string clears the stored key and falls back to the environment. */
  geminiApiKey?: string;
  openaiApiKey?: string;
}

/**
 * Writes only the fields present in the patch.
 *
 * A key of `''` is meaningful and distinct from `undefined`: it clears the stored
 * value so the environment secret takes over again. That is the only way back to
 * the deployed key once one has been typed here, so it has to be expressible.
 */
export async function setAiConfig(
  patch: AiConfigPatch,
  updatedBy?: string,
): Promise<AiProviderStatus> {
  const K = AI_SETTING_KEYS;
  const values: Record<string, SettingValue> = {};

  const putOption = <T extends string>(key: string, value: unknown, allowed: readonly T[]) => {
    if (value === undefined) return;
    const candidate = String(value).trim();
    if (!(allowed as readonly string[]).includes(candidate)) {
      throw AppError.badRequest(`"${candidate}" is not one of: ${allowed.join(', ')}`);
    }
    values[key] = candidate;
  };

  const putText = (key: string, value: unknown, max = 200) => {
    if (value === undefined) return;
    values[key] = String(value).trim().slice(0, max);
  };

  putOption(K.textProvider, patch.textProvider, TEXT_PROVIDERS);
  putOption(K.imageProvider, patch.imageProvider, IMAGE_PROVIDERS);
  putOption(K.generatorProvider, patch.generatorProvider, GENERATOR_PROVIDERS);

  putText(K.geminiTextModel, patch.geminiTextModel);
  putText(K.openaiTextModel, patch.openaiTextModel);
  putText(K.workersTextModels, patch.workersTextModels, 600);
  putText(K.geminiImageModel, patch.geminiImageModel);
  putText(K.workersImageModel, patch.workersImageModel);

  // Keys are trimmed hard: a value pasted from a dashboard often carries a
  // trailing newline, which produces a 400 from the provider that reads as "the
  // key is wrong" rather than "the key has whitespace on it".
  if (patch.geminiApiKey !== undefined) values[K.geminiApiKey] = patch.geminiApiKey.trim();
  if (patch.openaiApiKey !== undefined) values[K.openaiApiKey] = patch.openaiApiKey.trim();

  if (Object.keys(values).length > 0) await setSettings(values, updatedBy);
  return aiProviderStatus();
}

/* ----------------------------------- Test ---------------------------------- */

export interface ProviderTestResult {
  provider: string;
  ok: boolean;
  model: string;
  /** Round-trip time, so a working-but-slow provider is visible. */
  durationMs: number;
  /** The model's reply, truncated — proof it actually answered. */
  reply?: string;
  error?: string;
}

/**
 * Sends a trivial prompt to one provider and reports what happened.
 *
 * Worth its own endpoint because every other path that uses a key is slow and
 * indirect: without this, verifying a pasted key means starting a studio run and
 * waiting a minute to find out whether the failure was the key, the model id, the
 * quota, or the prompt. This isolates it to one call with one obvious answer.
 *
 * Never throws — a failed test is a result, not an error, and the operator needs
 * the provider's own message to know which of those four things went wrong.
 */
export async function testProvider(provider: TextProvider): Promise<ProviderTestResult> {
  const c = await getAiConfig();
  const started = Date.now();

  const model =
    provider === 'gemini'
      ? c.geminiTextModel
      : provider === 'openai'
        ? c.openaiTextModel
        : (c.workersTextModels[0] ?? '');

  try {
    const { buildTextEngine } = await import('./studio/text');
    const engine = buildTextEngine(provider, c);
    if (!engine) {
      throw AppError.badRequest(
        provider === 'workers-ai'
          ? 'Workers AI is not bound to this Worker.'
          : `No API key is configured for ${provider}.`,
      );
    }

    const reply = await engine.complete({
      system: 'You are a test harness. Reply with JSON only.',
      user: 'Reply with exactly {"ok":true} and nothing else.',
      // Deliberately generous for a nine-token answer. On current Gemini and
      // OpenAI reasoning models the output cap is a shared budget covering the
      // model's internal reasoning as well as the reply, so the old ceiling of
      // 32 was consumed before a single character was emitted — and this screen
      // then reported a working key and model as broken.
      maxTokens: 2048,
    });

    return {
      provider,
      ok: true,
      model,
      durationMs: Date.now() - started,
      reply: String(reply).trim().slice(0, 200),
    };
  } catch (error) {
    return {
      provider,
      ok: false,
      model,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
