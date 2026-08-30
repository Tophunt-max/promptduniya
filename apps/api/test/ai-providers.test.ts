import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { call, migrateTestDb, truncateAll, withBindings } from './helpers';

/**
 * AI provider configuration.
 *
 * The behaviour worth pinning down here is mostly about a secret not escaping.
 * Provider keys now live in `site_settings` so they can be entered from the
 * console, and that table is returned wholesale by `GET /v1/admin/settings` — so
 * the redaction is the only thing standing between an API key and the browser.
 * Two of these tests exist purely to fail loudly if that ever regresses.
 *
 * The rest covers precedence (a key typed in the console beats a deployed
 * secret), the fallbacks that keep an existing deployment behaving identically,
 * and the model-id plumbing that used to be string literals.
 */

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await truncateAll();
});

async function setting(key: string, value: string) {
  await env.DB.prepare(
    "INSERT INTO site_settings (key, value, value_type) VALUES (?, ?, 'string') " +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
    .bind(key, value)
    .run();
}

async function adminToken(email = 'boss@example.com'): Promise<string> {
  const register = await call('/v1/auth/register', {
    method: 'POST',
    body: { name: 'Boss', email, password: 'CorrectHorse7!', acceptTerms: true },
  });
  expect(register.status).toBe(201);
  const userId = (register.json.data as { user: { id: string } }).user.id;

  await env.DB.prepare("INSERT OR IGNORE INTO roles (id, name) VALUES ('role_admin', 'admin')").run();
  await env.DB.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)')
    .bind(userId, 'role_admin')
    .run();

  const login = await call('/v1/auth/login', {
    method: 'POST',
    body: { email, password: 'CorrectHorse7!' },
  });
  return (login.json.data as { accessToken: string }).accessToken;
}

async function editorToken(email = 'editor@example.com'): Promise<string> {
  const register = await call('/v1/auth/register', {
    method: 'POST',
    body: { name: 'Editor', email, password: 'CorrectHorse7!', acceptTerms: true },
  });
  const userId = (register.json.data as { user: { id: string } }).user.id;

  await env.DB.prepare("INSERT OR IGNORE INTO roles (id, name) VALUES ('role_editor', 'editor')").run();
  await env.DB.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)')
    .bind(userId, 'role_editor')
    .run();

  const login = await call('/v1/auth/login', {
    method: 'POST',
    body: { email, password: 'CorrectHorse7!' },
  });
  return (login.json.data as { accessToken: string }).accessToken;
}

/* ------------------------------- Resolution -------------------------------- */

describe('AI configuration resolution', () => {
  it('falls back to the current default model for every provider', async () => {
    const config = await withBindings(async () => {
      const { getAiConfig } = await import('../src/services/ai-providers');
      return await getAiConfig();
    });

    // These track the providers' live catalogues rather than what the engines
    // once hardcoded. The previous expectation pinned `gemini-2.0-flash`, which
    // Google has since retired — the assertion passed while the default it was
    // protecting returned 404 for every call.
    const { AI_DEFAULTS } = await import('../src/services/ai-providers');
    expect(config.geminiTextModel).toBe(AI_DEFAULTS.geminiTextModel);
    expect(config.openaiTextModel).toBe(AI_DEFAULTS.openaiTextModel);
    expect(config.geminiImageModel).toBe(AI_DEFAULTS.geminiImageModel);
    expect(config.workersImageModel).toBe(AI_DEFAULTS.workersImageModel);
    expect(config.workersTextModels[0]).toBe(AI_DEFAULTS.workersTextModels[0]);

    // The image default has to be one the engine knows how to drive — a model
    // whose schema it cannot fill is a cover that never renders.
    const { dimensionsFor } = await import('../src/services/images/workers-ai');
    expect(dimensionsFor('4:5')).toEqual({ width: 1024, height: 1280 });
    // Unparseable input must not produce a square by accident.
    expect(dimensionsFor(undefined).height).toBeGreaterThan(dimensionsFor(undefined).width);
  });

  it('prefers a stored provider and model over the deployed default', async () => {
    await setting('ai.text_provider', 'gemini');
    await setting('ai.gemini_text_model', 'gemini-2.5-pro');

    const config = await withBindings(async () => {
      const { getAiConfig } = await import('../src/services/ai-providers');
      return await getAiConfig();
    });

    expect(config.textProvider).toBe('gemini');
    expect(config.geminiTextModel).toBe('gemini-2.5-pro');
  });

  it('ignores a provider value it does not recognise', async () => {
    await setting('ai.text_provider', 'anthropic');

    const config = await withBindings(async () => {
      const { getAiConfig } = await import('../src/services/ai-providers');
      return await getAiConfig();
    });

    // A junk value must not silently disable generation.
    expect(config.textProvider).toBe('workers-ai');
  });

  it('parses the Workers AI fallback chain, and refuses to end up empty', async () => {
    await setting('ai.workers_text_models', ' @cf/one , @cf/two ,, ');

    const parsed = await withBindings(async () => {
      const { getAiConfig } = await import('../src/services/ai-providers');
      return await getAiConfig();
    });
    expect(parsed.workersTextModels).toEqual(['@cf/one', '@cf/two']);

    // An empty list would disable Workers AI while the console still showed it
    // selected, so the built-in chain has to win over nothing.
    await setting('ai.workers_text_models', '   ,  ,');
    const fallback = await withBindings(async () => {
      const { getAiConfig } = await import('../src/services/ai-providers');
      return await getAiConfig();
    });
    expect(fallback.workersTextModels.length).toBeGreaterThan(0);
  });

  it('reports which source a key came from', async () => {
    const before = await withBindings(async () => {
      const { getAiConfig } = await import('../src/services/ai-providers');
      return await getAiConfig();
    });
    // The test environment sets no provider secrets.
    expect(before.geminiKeySource).toBe('none');
    expect(before.geminiApiKey).toBe('');

    await setting('ai.gemini_api_key', 'AIzaTestKey1234567890');

    const after = await withBindings(async () => {
      const { getAiConfig } = await import('../src/services/ai-providers');
      return await getAiConfig();
    });
    expect(after.geminiKeySource).toBe('settings');
    expect(after.geminiApiKey).toBe('AIzaTestKey1234567890');
  });

  it('clearing a stored key falls back rather than leaving a blank override', async () => {
    const status = await withBindings(async () => {
      const { setAiConfig } = await import('../src/services/ai-providers');
      await setAiConfig({ geminiApiKey: 'AIzaSomethingLong123' });
      // An empty string is the documented way back to the deployed secret.
      return await setAiConfig({ geminiApiKey: '' });
    });

    expect(status.keys.gemini.configured).toBe(false);
    expect(status.keys.gemini.source).toBe('none');
  });
});

/* --------------------------------- Status ---------------------------------- */

describe('provider status', () => {
  it('never contains a key, only a masked hint', async () => {
    await setting('ai.gemini_api_key', 'AIzaSyD-SUPERSECRET-abcdef1234');
    await setting('ai.openai_api_key', 'sk-proj-SUPERSECRET-zyxwvu9876');

    const status = await withBindings(async () => {
      const { aiProviderStatus } = await import('../src/services/ai-providers');
      return await aiProviderStatus();
    });

    const serialised = JSON.stringify(status);
    expect(serialised).not.toContain('SUPERSECRET');
    expect(serialised).not.toContain('AIzaSyD-SUPERSECRET-abcdef1234');
    expect(serialised).not.toContain('sk-proj-SUPERSECRET-zyxwvu9876');

    // Enough to tell which key is installed, not enough to use it.
    expect(status.keys.gemini.hint).toBe('••••1234');
    expect(status.keys.openai.hint).toBe('••••9876');
    expect(status.keys.gemini.configured).toBe(true);
  });

  it('marks itself not ready when the chosen provider has no key', async () => {
    await setting('ai.text_provider', 'openai');

    const status = await withBindings(async () => {
      const { aiProviderStatus } = await import('../src/services/ai-providers');
      return await aiProviderStatus();
    });

    expect(status.readiness.openai).toBe(false);
    expect(status.ready).toBe(false);
  });

  it('only claims reference-image support on Gemini', async () => {
    await setting('ai.gemini_api_key', 'AIzaTestKey1234567890');

    await setting('ai.image_provider', 'workers-ai');
    const withWorkers = await withBindings(async () => {
      const { aiProviderStatus } = await import('../src/services/ai-providers');
      return await aiProviderStatus();
    });
    // FLUX is text-to-image only, so photo-edit covers cannot preserve a face.
    expect(withWorkers.supportsReferenceImages).toBe(false);

    await setting('ai.image_provider', 'gemini');
    const withGemini = await withBindings(async () => {
      const { aiProviderStatus } = await import('../src/services/ai-providers');
      return await aiProviderStatus();
    });
    expect(withGemini.supportsReferenceImages).toBe(true);
  });

  it('offers model presets for every provider', async () => {
    const status = await withBindings(async () => {
      const { aiProviderStatus } = await import('../src/services/ai-providers');
      return await aiProviderStatus();
    });

    expect(Object.keys(status.presets.text).sort()).toEqual(['gemini', 'openai', 'workers-ai']);
    expect(status.presets.image.gemini!.length).toBeGreaterThan(0);
  });
});

/* --------------------------------- Engines --------------------------------- */

describe('engine construction', () => {
  it('builds an engine named after the configured model', async () => {
    await setting('ai.gemini_api_key', 'AIzaTestKey1234567890');
    await setting('ai.gemini_text_model', 'gemini-2.5-pro');

    const name = await withBindings(async () => {
      const { getAiConfig } = await import('../src/services/ai-providers');
      const { buildTextEngine } = await import('../src/services/studio/text');
      const config = await getAiConfig();
      return buildTextEngine('gemini', config)?.name;
    });

    // The name is recorded on every generated prompt and in the audit log, so it
    // has to reflect the model that actually ran rather than a baked-in literal.
    expect(name).toBe('gemini:gemini-2.5-pro');
  });

  it('returns null for a provider with no credentials', async () => {
    const engine = await withBindings(async () => {
      const { getAiConfig } = await import('../src/services/ai-providers');
      const { buildTextEngine } = await import('../src/services/studio/text');
      return buildTextEngine('openai', await getAiConfig());
    });

    expect(engine).toBeNull();
  });

  it('refuses image generation when the provider is switched off', async () => {
    await setting('ai.image_provider', 'none');

    let message = '';
    try {
      await withBindings(async () => {
        const { resolveImageEngine } = await import('../src/services/images');
        return await resolveImageEngine();
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/switched off/i);
  });

  it('reports the resolved model in the text status', async () => {
    await setting('ai.text_provider', 'gemini');
    await setting('ai.gemini_api_key', 'AIzaTestKey1234567890');
    await setting('ai.gemini_text_model', 'gemini-2.5-flash');

    const status = await withBindings(async () => {
      const { textProviderStatus } = await import('../src/services/studio/text');
      return await textProviderStatus();
    });

    expect(status).toMatchObject({ provider: 'gemini', model: 'gemini-2.5-flash', gemini: true });
  });
});

/* ---------------------------------- Routes --------------------------------- */

describe('AI config endpoints', () => {
  it('requires an administrator', async () => {
    expect((await call('/v1/admin/ai-config')).status).toBe(401);

    const editor = await editorToken();
    expect((await call('/v1/admin/ai-config', { token: editor })).status).toBe(403);
  });

  it('round-trips providers and models without echoing the key', async () => {
    const token = await adminToken();

    const saved = await call('/v1/admin/ai-config', {
      method: 'PUT',
      token,
      body: {
        textProvider: 'gemini',
        geminiTextModel: 'gemini-2.5-pro',
        geminiApiKey: 'AIzaSyD-NEVER-LEAK-abcd7777',
        imageProvider: 'gemini',
      },
    });

    expect(saved.status).toBe(200);
    const body = JSON.stringify(saved.json);
    expect(body).not.toContain('NEVER-LEAK');
    expect(body).not.toContain('AIzaSyD-NEVER-LEAK-abcd7777');

    const data = saved.json.data as {
      textProvider: string;
      models: { geminiText: string };
      keys: { gemini: { configured: boolean; hint: string; source: string } };
    };
    expect(data.textProvider).toBe('gemini');
    expect(data.models.geminiText).toBe('gemini-2.5-pro');
    expect(data.keys.gemini).toMatchObject({ configured: true, hint: '••••7777', source: 'settings' });
  });

  it('rejects a provider it does not support', async () => {
    const token = await adminToken();

    const res = await call('/v1/admin/ai-config', {
      method: 'PUT',
      token,
      body: { textProvider: 'anthropic' },
    });

    expect(res.status).toBe(422);
  });

  /**
   * The important one.
   *
   * `GET /v1/admin/settings` returns the whole settings map, and keys now live in
   * that table. Without redaction this endpoint would hand a live credential to
   * the browser on every visit to the settings screen.
   */
  it('redacts provider keys from the generic settings endpoint', async () => {
    const token = await adminToken();

    await call('/v1/admin/ai-config', {
      method: 'PUT',
      token,
      body: { geminiApiKey: 'AIzaSyD-NEVER-LEAK-abcd7777' },
    });

    const settings = await call('/v1/admin/settings', { token });
    expect(settings.status).toBe(200);

    const body = JSON.stringify(settings.json);
    expect(body).not.toContain('NEVER-LEAK');
    expect(body).not.toContain('AIzaSyD-NEVER-LEAK-abcd7777');

    // Replaced rather than removed, so the screen can still show a value exists.
    const values = settings.json.data as Record<string, string>;
    expect(values['ai.gemini_api_key']).toBe('__set__');
  });

  it('refuses to write a key through the generic settings endpoint', async () => {
    const token = await adminToken();

    // Otherwise a screen that round-tripped the whole map would overwrite the real
    // key with the literal '__set__' and silently break every AI call.
    const res = await call('/v1/admin/settings', {
      method: 'PUT',
      token,
      body: { 'ai.gemini_api_key': '__set__' },
    });

    expect(res.status).toBe(400);
    expect(res.json.error?.message).toMatch(/AI providers screen/i);
  });

  it('reports a failed provider test as a result, not an error', async () => {
    const token = await adminToken();

    // No key is configured, so this cannot succeed — the point is that it comes
    // back as a readable diagnosis rather than a 500.
    const res = await call('/v1/admin/ai-config/test', {
      method: 'POST',
      token,
      body: { provider: 'openai' },
    });

    expect(res.status).toBe(200);
    const result = res.json.data as { ok: boolean; error?: string; model: string };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/api key/i);
    expect(result.model).toBe('gpt-4o-mini');
  });

  it('records a key change in the audit log without recording the key', async () => {
    const token = await adminToken();

    await call('/v1/admin/ai-config', {
      method: 'PUT',
      token,
      body: { geminiApiKey: 'AIzaSyD-NEVER-LEAK-abcd7777', textProvider: 'gemini' },
    });

    const logs = await call('/v1/admin/logs', { token });
    const body = JSON.stringify(logs.json);
    expect(body).not.toContain('NEVER-LEAK');

    const items = logs.json.data as { items: { action: string; metaJson: string | null }[] };
    const entry = items.items.find((row) => row.action === 'ai.config.update');
    expect(entry).toBeDefined();
    // It should say a key changed, and name the fields that are safe to name.
    expect(entry?.metaJson).toContain('geminiKeyChanged');
    expect(entry?.metaJson).not.toContain('abcd7777');
  });
});
