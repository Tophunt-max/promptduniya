import { beforeEach, describe, expect, it } from 'vitest';

import type { AppError } from '@/lib/api';
import { hashVisitor } from '@/lib/crypto';
import { copyPrompt, toggleFavorite, toggleLike, withInstructions } from '@/services/engagement';
import { resolveAccess } from '@/services/entitlements';
import { getPromptBySlug } from '@/services/prompts';
import {
  createTestCategory,
  createTestPrompt,
  createTestUser,
  grantTestPremium,
  resetDatabase,
  seedRoles,
  seedTestPlans,
  setTestLimits,
} from './helpers';

/**
 * Copy limits and premium gating.
 *
 * The central claim under test: prompt text is only ever released by
 * `copyPrompt`, and only after the entitlement and quota checks pass.
 */

let categoryId: string;
let authorId: string;

beforeEach(async () => {
  await resetDatabase();
  await seedRoles();
  await seedTestPlans();
  await setTestLimits({ freeCopies: 3, freeFavorites: 2, anonCopies: 1 });

  const author = await createTestUser({ roleNames: ['admin', 'user'] });
  authorId = author.id;
  categoryId = await createTestCategory('Portrait');
});

describe('daily copy limits', () => {
  it('allows a free user up to their configured daily limit', async () => {
    const user = await createTestUser();
    const access = await resolveAccess(user.id);
    const prompt = await createTestPrompt({ categoryId, authorId });

    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await copyPrompt({
        access,
        visitorHash: null,
        promptId: prompt.id,
        variant: 'plain',
      });
      expect(result.promptText).toBeTruthy();
      expect(result.usage.used).toBe(attempt);
    }

    await expect(
      copyPrompt({ access, visitorHash: null, promptId: prompt.id, variant: 'plain' }),
    ).rejects.toThrow(/all 3 free copies/i);
  });

  it('reports the upgrade path when a free user hits the limit', async () => {
    const user = await createTestUser();
    const access = await resolveAccess(user.id);
    const prompt = await createTestPrompt({ categoryId, authorId });

    for (let i = 0; i < 3; i++) {
      await copyPrompt({ access, visitorHash: null, promptId: prompt.id, variant: 'plain' });
    }

    try {
      await copyPrompt({ access, visitorHash: null, promptId: prompt.id, variant: 'plain' });
      expect.unreachable('the fourth copy should have been rejected');
    } catch (error) {
      const appError = error as AppError;
      expect(appError.code).toBe('limit_reached');
      expect(appError.status).toBe(403);
      expect((appError.details as { upgrade: string }).upgrade).toBe('/premium');
    }
  });

  it('applies a separate, tighter limit to anonymous visitors', async () => {
    const access = await resolveAccess(null);
    const visitorHash = hashVisitor('203.0.113.9', 'test-agent');
    const prompt = await createTestPrompt({ categoryId, authorId });

    const first = await copyPrompt({ access, visitorHash, promptId: prompt.id, variant: 'plain' });
    expect(first.promptText).toBeTruthy();

    await expect(
      copyPrompt({ access, visitorHash, promptId: prompt.id, variant: 'plain' }),
    ).rejects.toThrow(/guests can copy/i);
  });

  it('counts each visitor separately', async () => {
    const access = await resolveAccess(null);
    const prompt = await createTestPrompt({ categoryId, authorId });

    await copyPrompt({
      access,
      visitorHash: hashVisitor('198.51.100.1', 'agent-a'),
      promptId: prompt.id,
      variant: 'plain',
    });

    // A different visitor still has their own allowance.
    const other = await copyPrompt({
      access,
      visitorHash: hashVisitor('198.51.100.2', 'agent-b'),
      promptId: prompt.id,
      variant: 'plain',
    });
    expect(other.promptText).toBeTruthy();
  });

  it('never limits a premium member', async () => {
    const user = await createTestUser();
    await grantTestPremium(user.id, 'monthly');
    const access = await resolveAccess(user.id);
    const prompt = await createTestPrompt({ categoryId, authorId });

    for (let i = 0; i < 12; i++) {
      const result = await copyPrompt({
        access,
        visitorHash: null,
        promptId: prompt.id,
        variant: 'plain',
      });
      expect(result.usage.unlimited).toBe(true);
    }
  });

  it('increments the public copy counter', async () => {
    const user = await createTestUser();
    const access = await resolveAccess(user.id);
    const prompt = await createTestPrompt({ categoryId, authorId });

    const first = await copyPrompt({
      access,
      visitorHash: null,
      promptId: prompt.id,
      variant: 'plain',
    });
    const second = await copyPrompt({
      access,
      visitorHash: null,
      promptId: prompt.id,
      variant: 'plain',
    });

    expect(first.copyCount).toBe(1);
    expect(second.copyCount).toBe(2);
  });
});

describe('premium prompt gating', () => {
  it('withholds the prompt body from a free user in the detail payload', async () => {
    const prompt = await createTestPrompt({ categoryId, authorId, isPremium: true });
    const detail = await getPromptBySlug(prompt.slug, { canSeePremium: false });

    expect(detail).toBeTruthy();
    expect(detail!.locked).toBe(true);
    // The critical assertion: no prompt text reaches an unentitled client.
    expect(detail!.promptText).toBeNull();
    expect(detail!.negativePrompt).toBeNull();
    expect(detail!.usageInstructions).toBeNull();
    // Non-sensitive metadata is still present for SEO and upsell.
    expect(detail!.title).toBeTruthy();
    expect(detail!.shortDescription).toBeTruthy();
  });

  it('includes the prompt body for an entitled viewer', async () => {
    const prompt = await createTestPrompt({
      categoryId,
      authorId,
      isPremium: true,
      promptText: 'A premium prompt body that only members should see.',
    });

    const detail = await getPromptBySlug(prompt.slug, { canSeePremium: true });

    expect(detail!.locked).toBe(false);
    expect(detail!.promptText).toContain('only members should see');
  });

  it('refuses a copy of a premium prompt by a free user with 402', async () => {
    const user = await createTestUser();
    const access = await resolveAccess(user.id);
    const prompt = await createTestPrompt({ categoryId, authorId, isPremium: true });

    try {
      await copyPrompt({ access, visitorHash: null, promptId: prompt.id, variant: 'plain' });
      expect.unreachable('a free user must not be able to copy a premium prompt');
    } catch (error) {
      const appError = error as AppError;
      expect(appError.status).toBe(402);
      expect(appError.code).toBe('payment_required');
    }
  });

  it('allows a premium member to copy a premium prompt', async () => {
    const user = await createTestUser();
    await grantTestPremium(user.id, 'monthly');
    const access = await resolveAccess(user.id);
    const prompt = await createTestPrompt({ categoryId, authorId, isPremium: true });

    const result = await copyPrompt({
      access,
      visitorHash: null,
      promptId: prompt.id,
      variant: 'plain',
    });
    expect(result.promptText).toBeTruthy();
  });

  it('refuses to serve an unpublished prompt', async () => {
    const user = await createTestUser();
    const access = await resolveAccess(user.id);
    const prompt = await createTestPrompt({ categoryId, authorId, isPublished: false });

    await expect(
      copyPrompt({ access, visitorHash: null, promptId: prompt.id, variant: 'plain' }),
    ).rejects.toThrow(/not found/i);

    const detail = await getPromptBySlug(prompt.slug);
    expect(detail).toBeNull();
  });
});

describe('favourites', () => {
  it('enforces the free saved-prompt cap', async () => {
    const user = await createTestUser();
    const access = await resolveAccess(user.id);

    const first = await createTestPrompt({ categoryId, authorId, title: 'One' });
    const second = await createTestPrompt({ categoryId, authorId, title: 'Two' });
    const third = await createTestPrompt({ categoryId, authorId, title: 'Three' });

    await toggleFavorite(access, first.id);
    await toggleFavorite(access, second.id);

    await expect(toggleFavorite(access, third.id)).rejects.toThrow(/upgrade to premium/i);
  });

  it('frees a slot when a favourite is removed', async () => {
    const user = await createTestUser();
    const access = await resolveAccess(user.id);

    const first = await createTestPrompt({ categoryId, authorId, title: 'One' });
    const second = await createTestPrompt({ categoryId, authorId, title: 'Two' });
    const third = await createTestPrompt({ categoryId, authorId, title: 'Three' });

    await toggleFavorite(access, first.id);
    await toggleFavorite(access, second.id);

    const removed = await toggleFavorite(access, first.id);
    expect(removed.saved).toBe(false);

    const added = await toggleFavorite(access, third.id);
    expect(added.saved).toBe(true);
  });

  it('lets premium members save without limit', async () => {
    const user = await createTestUser();
    await grantTestPremium(user.id, 'monthly');
    const access = await resolveAccess(user.id);

    for (let i = 0; i < 6; i++) {
      const prompt = await createTestPrompt({ categoryId, authorId, title: `Prompt ${i}` });
      const result = await toggleFavorite(access, prompt.id);
      expect(result.saved).toBe(true);
      expect(result.usage.unlimited).toBe(true);
    }
  });

  it('requires authentication', async () => {
    const access = await resolveAccess(null);
    const prompt = await createTestPrompt({ categoryId, authorId });

    await expect(toggleFavorite(access, prompt.id)).rejects.toThrow(/sign in/i);
  });
});

describe('likes', () => {
  it('toggles on and off and keeps the counter accurate', async () => {
    const user = await createTestUser();
    const prompt = await createTestPrompt({ categoryId, authorId });

    const liked = await toggleLike(user.id, prompt.id);
    expect(liked.liked).toBe(true);
    expect(liked.likeCount).toBe(1);

    const unliked = await toggleLike(user.id, prompt.id);
    expect(unliked.liked).toBe(false);
    expect(unliked.likeCount).toBe(0);
  });

  it('never lets the counter go negative', async () => {
    const user = await createTestUser();
    const prompt = await createTestPrompt({ categoryId, authorId });

    await toggleLike(user.id, prompt.id);
    await toggleLike(user.id, prompt.id);
    const third = await toggleLike(user.id, prompt.id);

    expect(third.likeCount).toBeGreaterThanOrEqual(0);
  });

  it('counts one like per user', async () => {
    const first = await createTestUser();
    const second = await createTestUser();
    const prompt = await createTestPrompt({ categoryId, authorId });

    await toggleLike(first.id, prompt.id);
    const result = await toggleLike(second.id, prompt.id);

    expect(result.likeCount).toBe(2);
  });
});

describe('copy with instructions', () => {
  it('builds a document with every section that is present', () => {
    const output = withInstructions({
      title: 'Golden Hour Portrait',
      aiModel: 'gemini',
      promptText: 'A warm rooftop portrait.',
      negativePrompt: 'blurry, extra fingers',
      usageInstructions: 'Generate three variations.',
    });

    expect(output).toContain('# Golden Hour Portrait');
    expect(output).toContain('## Prompt');
    expect(output).toContain('A warm rooftop portrait.');
    expect(output).toContain('## Negative prompt');
    expect(output).toContain('## How to use');
    expect(output).toContain('gemini');
  });

  it('omits sections with no content', () => {
    const output = withInstructions({
      title: 'Simple',
      aiModel: 'flux',
      promptText: 'A prompt.',
      negativePrompt: null,
      usageInstructions: null,
    });

    expect(output).not.toContain('## Negative prompt');
    expect(output).not.toContain('## How to use');
    expect(output).toContain('## Prompt');
  });
});
