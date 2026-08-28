import { beforeEach, describe, expect, it } from 'vitest';

import { AppError } from '@/lib/api';
import { hashVisitor } from '@/lib/crypto';
import { resolveAccess } from '@/services/entitlements';
import { generatePrompt, generateRandom, listGenerated, randomBrief, saveGenerated } from '@/services/generator';
import { templateEngine } from '@/services/generator/template-engine';
import {
  createTestUser,
  resetDatabase,
  seedRoles,
  seedTestPlans,
  setTestLimits,
} from './helpers';

beforeEach(async () => {
  await resetDatabase();
  await seedRoles();
  await seedTestPlans();
  await setTestLimits({ freeGenerator: 2, anonGenerator: 1 });
});

describe('template engine', () => {
  it('produces a complete prompt from a nearly empty brief', async () => {
    const result = await templateEngine.generate({ aiModel: 'gemini', useAi: false });

    expect(result.prompt.length).toBeGreaterThan(120);
    expect(result.negativePrompt.length).toBeGreaterThan(20);
    expect(result.title).toBeTruthy();
    expect(result.engine).toBe('template');
    expect(result.tips.length).toBeGreaterThan(0);
  });

  it('uses Midjourney parameter flags for Midjourney', async () => {
    const result = await templateEngine.generate({
      aiModel: 'midjourney',
      aspectRatio: '16:9',
      useAi: false,
    });

    expect(result.prompt).toContain('--ar 16:9');
    expect(result.prompt).toContain('--style raw');
    // Midjourney has no negative field, so exclusions use --no.
    expect(result.negativePrompt.startsWith('--no ')).toBe(true);
  });

  it('uses weighted keywords for Flux and Stable Diffusion', async () => {
    for (const model of ['flux', 'stable-diffusion'] as const) {
      const result = await templateEngine.generate({ aiModel: model, useAi: false });
      expect(result.prompt).toMatch(/\(.+:1\.\d\)/);
      expect(result.negativePrompt).not.toContain('--no');
    }
  });

  it('uses structured prose for Gemini and ChatGPT', async () => {
    for (const model of ['gemini', 'chatgpt'] as const) {
      const result = await templateEngine.generate({ aiModel: model, useAi: false });
      expect(result.prompt).toContain('\n\n');
      expect(result.prompt).not.toContain('--ar');
    }
  });

  it('honours every supplied field', async () => {
    const result = await templateEngine.generate({
      aiModel: 'gemini',
      subject: 'a master weaver at his loom',
      location: 'a Varanasi workshop',
      outfit: 'a plain cotton kurta',
      lighting: 'shaft of window light',
      camera: '35mm documentary, f/2.0',
      mood: 'Contemplative',
      additionalInstructions: 'include visible silk threads',
      useAi: false,
    });

    expect(result.prompt).toContain('a master weaver at his loom');
    expect(result.prompt).toContain('Varanasi workshop');
    expect(result.prompt).toContain('plain cotton kurta');
    expect(result.prompt).toContain('shaft of window light');
    expect(result.prompt).toContain('include visible silk threads');
  });

  it('adds product-specific exclusions for product briefs', async () => {
    const result = await templateEngine.generate({
      aiModel: 'flux',
      imageType: 'Product',
      useAi: false,
    });

    expect(result.negativePrompt).toContain('fingerprints on product');
  });

  it('adds multi-subject exclusions for couples', async () => {
    const result = await templateEngine.generate({
      aiModel: 'flux',
      gender: 'couple',
      useAi: false,
    });

    expect(result.negativePrompt).toMatch(/merged bodies|inconsistent faces/);
  });
});

describe('generator quotas', () => {
  it('limits an anonymous visitor', async () => {
    const access = await resolveAccess(null);
    const visitorHash = hashVisitor('203.0.113.44', 'agent');

    const first = await generatePrompt({
      access,
      visitorHash,
      form: { aiModel: 'gemini', useAi: false },
    });
    expect(first.prompt).toBeTruthy();

    await expect(
      generatePrompt({ access, visitorHash, form: { aiModel: 'gemini', useAi: false } }),
    ).rejects.toThrow(/guests get 1 generator run/i);
  });

  it('limits a free member to the configured daily runs', async () => {
    const user = await createTestUser();
    const access = await resolveAccess(user.id);

    await generatePrompt({ access, visitorHash: null, form: { aiModel: 'gemini', useAi: false } });
    await generatePrompt({ access, visitorHash: null, form: { aiModel: 'gemini', useAi: false } });

    try {
      await generatePrompt({ access, visitorHash: null, form: { aiModel: 'gemini', useAi: false } });
      expect.unreachable('the third run should be rejected');
    } catch (error) {
      const appError = error as AppError;
      expect(appError.code).toBe('limit_reached');
      expect((appError.details as { upgrade: string }).upgrade).toBe('/premium');
    }
  });

  it('reports remaining runs accurately', async () => {
    const user = await createTestUser();
    const access = await resolveAccess(user.id);

    const first = await generatePrompt({
      access,
      visitorHash: null,
      form: { aiModel: 'gemini', useAi: false },
    });

    expect(first.usage.used).toBe(1);
    expect(first.usage.limit).toBe(2);
    expect(first.usage.remaining).toBe(1);
    expect(first.usage.unlimited).toBe(false);
  });

  it('ignores useAi for members without the advanced generator entitlement', async () => {
    const user = await createTestUser();
    const access = await resolveAccess(user.id);

    // Requesting the AI engine without the entitlement must fall back silently
    // to the template engine rather than erroring or calling an API.
    const result = await generatePrompt({
      access,
      visitorHash: null,
      form: { aiModel: 'gemini', useAi: true },
    });

    expect(result.engine).toBe('template');
  });

  it('records each run in the user\u2019s history', async () => {
    const user = await createTestUser();
    const access = await resolveAccess(user.id);

    await generatePrompt({ access, visitorHash: null, form: { aiModel: 'gemini', useAi: false } });
    await generatePrompt({ access, visitorHash: null, form: { aiModel: 'flux', useAi: false } });

    const history = await listGenerated(user.id);
    expect(history).toHaveLength(2);
    expect(history.map((row) => row.aiModel)).toContain('flux');
  });

  it('can mark a generated prompt as saved', async () => {
    const user = await createTestUser();
    const access = await resolveAccess(user.id);

    const result = await generatePrompt({
      access,
      visitorHash: null,
      form: { aiModel: 'gemini', useAi: false },
    });

    await saveGenerated(user.id, result.id, 'My saved prompt');

    const saved = await listGenerated(user.id, { savedOnly: true });
    expect(saved).toHaveLength(1);
    expect(saved[0]?.title).toBe('My saved prompt');
  });

  it('refuses to let one user save another user\u2019s generation', async () => {
    const owner = await createTestUser();
    const attacker = await createTestUser();
    const access = await resolveAccess(owner.id);

    const result = await generatePrompt({
      access,
      visitorHash: null,
      form: { aiModel: 'gemini', useAi: false },
    });

    await expect(saveGenerated(attacker.id, result.id)).rejects.toThrow(AppError);
  });
});

describe('random generator', () => {
  it('fills every field of the brief', () => {
    const brief = randomBrief();

    expect(brief.aiModel).toBeTruthy();
    expect(brief.imageType).toBeTruthy();
    expect(brief.style).toBeTruthy();
    expect(brief.location).toBeTruthy();
    expect(brief.outfit).toBeTruthy();
    expect(brief.pose).toBeTruthy();
    expect(brief.lighting).toBeTruthy();
    expect(brief.camera).toBeTruthy();
    expect(brief.mood).toBeTruthy();
    expect(brief.colorTone).toBeTruthy();
    expect(brief.aspectRatio).toBeTruthy();
  });

  it('honours a requested model', () => {
    const brief = randomBrief('midjourney');
    expect(brief.aiModel).toBe('midjourney');
  });

  it('falls back to a random model for an unknown value', () => {
    const brief = randomBrief('not-a-real-model');
    expect(brief.aiModel).not.toBe('not-a-real-model');
  });

  it('returns both a prompt and the brief that produced it', async () => {
    const user = await createTestUser();
    const access = await resolveAccess(user.id);

    const result = await generateRandom({ access, visitorHash: null, aiModel: 'gemini' });

    expect(result.prompt).toBeTruthy();
    expect(result.brief.aiModel).toBe('gemini');
    expect(result.brief.style).toBeTruthy();
  });

  it('counts against the same generator quota', async () => {
    const user = await createTestUser();
    const access = await resolveAccess(user.id);

    await generateRandom({ access, visitorHash: null });
    await generateRandom({ access, visitorHash: null });

    await expect(generateRandom({ access, visitorHash: null })).rejects.toThrow(/limit/i);
  });
});
