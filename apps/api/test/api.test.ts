import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { call, migrateTestDb, truncateAll } from './helpers';

/**
 * End-to-end API tests against a real local D1 + KV (Miniflare).
 *
 * These prove the split architecture actually works on the Worker runtime:
 * token auth, entitlement resolution, and premium gating over HTTP.
 */

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await truncateAll();
  // A category and two published prompts (one free, one premium).
  await env.DB.exec("INSERT INTO categories (id, name, slug) VALUES ('cat1', 'Portrait', 'portrait')");
  await env.DB.exec(
    "INSERT INTO prompts (id, title, slug, short_description, prompt_text, ai_model, category_id, is_published, published_at) " +
      "VALUES ('p_free', 'Free Portrait', 'free-portrait', 'A free portrait prompt.', 'A calm portrait in soft window light, 85mm.', 'gemini', 'cat1', 1, 1)",
  );
  await env.DB.exec(
    "INSERT INTO prompts (id, title, slug, short_description, prompt_text, ai_model, category_id, is_premium, is_published, published_at) " +
      "VALUES ('p_prem', 'Premium Portrait', 'premium-portrait', 'A premium portrait prompt.', 'SECRET premium prompt body only members see.', 'gemini', 'cat1', 1, 1, 1)",
  );
  // Tighten the free copy limit so the quota test is fast.
  await env.DB.exec(
    "INSERT INTO site_settings (key, value, value_type) VALUES ('limits.free.copies_per_day', '2', 'number')",
  );
});

async function registerAndToken(email: string): Promise<string> {
  const res = await call('/v1/auth/register', {
    method: 'POST',
    body: { name: 'Test User', email, password: 'CorrectHorse7!', acceptTerms: true },
  });
  expect(res.status).toBe(201);
  return (res.json.data as { accessToken: string }).accessToken;
}

describe('health', () => {
  it('responds ready', async () => {
    const res = await call('/health');
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
  });
});

describe('auth (JWT over D1 + KV)', () => {
  it('registers a user and returns an access token', async () => {
    const res = await call('/v1/auth/register', {
      method: 'POST',
      body: { name: 'Ananya', email: 'ananya@example.com', password: 'CorrectHorse7!', acceptTerms: true },
    });
    expect(res.status).toBe(201);
    const data = res.json.data as { accessToken: string; user: { email: string } };
    expect(data.accessToken).toBeTruthy();
    expect(data.user.email).toBe('ananya@example.com');
  });

  it('rejects a duplicate email', async () => {
    await registerAndToken('dupe@example.com');
    const res = await call('/v1/auth/register', {
      method: 'POST',
      body: { name: 'Dup', email: 'dupe@example.com', password: 'CorrectHorse7!', acceptTerms: true },
    });
    expect(res.status).toBe(409);
  });

  it('logs in and rejects a wrong password', async () => {
    await registerAndToken('login@example.com');

    const ok = await call('/v1/auth/login', {
      method: 'POST',
      body: { email: 'login@example.com', password: 'CorrectHorse7!' },
    });
    expect(ok.status).toBe(200);

    const bad = await call('/v1/auth/login', {
      method: 'POST',
      body: { email: 'login@example.com', password: 'WrongPassword1!' },
    });
    expect(bad.status).toBe(401);
  });

  it('returns the current user and free-tier access from /me', async () => {
    const token = await registerAndToken('me@example.com');
    const res = await call('/v1/auth/me', { token });
    expect(res.status).toBe(200);
    const data = res.json.data as { access: { isPremium: boolean; planCode: string } };
    expect(data.access.isPremium).toBe(false);
    expect(data.access.planCode).toBe('free');
  });

  it('refuses /me without a token', async () => {
    const res = await call('/v1/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('prompts', () => {
  it('lists published prompts without exposing the body', async () => {
    const res = await call('/v1/prompts');
    expect(res.status).toBe(200);
    const data = res.json.data as { total: number; items: Record<string, unknown>[] };
    expect(data.total).toBe(2);
    // Card payload must not carry the prompt text.
    expect(data.items[0]).not.toHaveProperty('promptText');
  });

  it('returns the free prompt body on the detail endpoint', async () => {
    const res = await call('/v1/prompts/free-portrait');
    expect(res.status).toBe(200);
    const data = res.json.data as { locked: boolean; promptText: string | null };
    expect(data.locked).toBe(false);
    expect(data.promptText).toContain('soft window light');
  });

  it('locks the premium prompt body for anonymous/free viewers', async () => {
    const res = await call('/v1/prompts/premium-portrait');
    expect(res.status).toBe(200);
    const data = res.json.data as { locked: boolean; promptText: string | null };
    expect(data.locked).toBe(true);
    expect(data.promptText).toBeNull();
  });
});

describe('copy — gating and quota', () => {
  it('lets a free user copy a free prompt', async () => {
    const token = await registerAndToken('copy1@example.com');
    const res = await call('/v1/prompts/copy', {
      method: 'POST',
      token,
      body: { promptId: 'p_free', variant: 'plain' },
    });
    expect(res.status).toBe(200);
    const data = res.json.data as { promptText: string };
    expect(data.promptText).toContain('soft window light');
  });

  it('refuses a free user copying a premium prompt with 402', async () => {
    const token = await registerAndToken('copy2@example.com');
    const res = await call('/v1/prompts/copy', {
      method: 'POST',
      token,
      body: { promptId: 'p_prem', variant: 'plain' },
    });
    expect(res.status).toBe(402);
    expect(res.json.error?.code).toBe('payment_required');
  });

  it('enforces the configured daily copy limit', async () => {
    const token = await registerAndToken('copy3@example.com');
    // limit is set to 2 in beforeEach
    const first = await call('/v1/prompts/copy', { method: 'POST', token, body: { promptId: 'p_free', variant: 'plain' } });
    const second = await call('/v1/prompts/copy', { method: 'POST', token, body: { promptId: 'p_free', variant: 'plain' } });
    const third = await call('/v1/prompts/copy', { method: 'POST', token, body: { promptId: 'p_free', variant: 'plain' } });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(403);
    expect(third.json.error?.code).toBe('limit_reached');
  });
});
