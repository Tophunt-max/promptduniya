import { beforeEach, describe, expect, it } from 'vitest';

import { AppError } from '@/lib/api';
import { slugify } from '@/lib/utils';
import { listCategories } from '@/services/categories';
import {
  adminListPrompts,
  createPrompt,
  deletePrompt,
  getPromptBySlug,
  listPrompts,
  recomputeTrending,
  setPromptPublished,
  updatePrompt,
} from '@/services/prompts';
import { searchPrompts, suggest } from '@/services/search';
import {
  createTestCategory,
  createTestPrompt,
  createTestUser,
  resetDatabase,
  seedRoles,
  seedTestPlans,
} from './helpers';

let categoryId: string;
let otherCategoryId: string;
let authorId: string;

beforeEach(async () => {
  await resetDatabase();
  await seedRoles();
  await seedTestPlans();

  authorId = (await createTestUser({ roleNames: ['admin', 'user'] })).id;
  categoryId = await createTestCategory('Portrait');
  otherCategoryId = await createTestCategory('Wedding');
});

describe('prompt creation', () => {
  it('creates a published prompt with a generated slug', async () => {
    const result = await createPrompt(
      {
        title: 'Golden Hour Rooftop Portrait',
        shortDescription: 'A warm rooftop portrait at sunset.',
        promptText: 'A cinematic golden-hour portrait on an open rooftop.',
        aiModel: 'gemini',
        categoryId,
        difficulty: 'beginner',
        tags: ['portrait', 'golden hour'],
        isPremium: false,
        isFeatured: false,
        isTrending: false,
        isEditorsPick: false,
        isPublished: true,
        exampleImages: [],
      },
      authorId,
    );

    expect(result.slug).toBe(slugify('Golden Hour Rooftop Portrait'));

    const detail = await getPromptBySlug(result.slug, { canSeePremium: true });
    expect(detail!.title).toBe('Golden Hour Rooftop Portrait');
    expect(detail!.tags.map((tag) => tag.name)).toContain('portrait');
  });

  it('de-duplicates slugs rather than overwriting', async () => {
    const first = await createTestPrompt({ categoryId, authorId, title: 'Same Title' });
    const second = await createTestPrompt({ categoryId, authorId, title: 'Same Title' });

    expect(first.slug).not.toBe(second.slug);
  });

  it('rejects an invalid category', async () => {
    await expect(
      createTestPrompt({ categoryId: 'not-a-real-category', authorId }),
    ).rejects.toThrow(AppError);
  });

  it('keeps drafts out of public listings', async () => {
    await createTestPrompt({ categoryId, authorId, isPublished: false, title: 'Draft One' });
    await createTestPrompt({ categoryId, authorId, isPublished: true, title: 'Live One' });

    const publicList = await listPrompts({});
    expect(publicList.total).toBe(1);
    expect(publicList.items[0]?.title).toBe('Live One');

    // Admin listings see everything.
    const adminList = await adminListPrompts({ status: 'all' });
    expect(adminList.total).toBe(2);
  });

  it('maintains the category prompt count', async () => {
    await createTestPrompt({ categoryId, authorId });
    await createTestPrompt({ categoryId, authorId });

    const categories = await listCategories();
    const portrait = categories.find((category) => category.id === categoryId);
    expect(portrait?.promptCount).toBe(2);
  });
});

describe('prompt updates', () => {
  it('moves a prompt between categories and fixes both counts', async () => {
    const prompt = await createTestPrompt({ categoryId, authorId, title: 'Movable' });

    await updatePrompt(prompt.id, {
      title: 'Movable',
      shortDescription: 'Updated description for the moved prompt.',
      promptText: 'Updated prompt text for the moved prompt.',
      aiModel: 'gemini',
      categoryId: otherCategoryId,
      difficulty: 'beginner',
      tags: [],
      isPremium: false,
      isFeatured: false,
      isTrending: false,
      isEditorsPick: false,
      isPublished: true,
      exampleImages: [],
    });

    const categories = await listCategories();
    expect(categories.find((c) => c.id === categoryId)?.promptCount).toBe(0);
    expect(categories.find((c) => c.id === otherCategoryId)?.promptCount).toBe(1);
  });

  it('can unpublish and republish', async () => {
    const prompt = await createTestPrompt({ categoryId, authorId });

    await setPromptPublished(prompt.id, false);
    expect(await getPromptBySlug(prompt.slug)).toBeNull();

    await setPromptPublished(prompt.id, true);
    expect(await getPromptBySlug(prompt.slug)).toBeTruthy();
  });

  it('deletes a prompt and updates the category count', async () => {
    const prompt = await createTestPrompt({ categoryId, authorId });
    await deletePrompt(prompt.id);

    expect(await getPromptBySlug(prompt.slug)).toBeNull();
    const categories = await listCategories();
    expect(categories.find((c) => c.id === categoryId)?.promptCount).toBe(0);
  });

  it('rejects deleting a prompt that does not exist', async () => {
    await expect(deletePrompt('missing-prompt-id')).rejects.toThrow(AppError);
  });
});

describe('listing and filtering', () => {
  beforeEach(async () => {
    await createPrompt(
      {
        title: 'Gemini Saree Portrait',
        shortDescription: 'A saree portrait in a courtyard.',
        promptText: 'Handloom saree portrait with soft daylight.',
        aiModel: 'gemini',
        categoryId,
        style: 'Cinematic',
        aspectRatio: '4:5',
        gender: 'female',
        difficulty: 'beginner',
        tags: ['saree'],
        isPremium: false,
        isFeatured: true,
        isTrending: true,
        isEditorsPick: false,
        isPublished: true,
        exampleImages: [],
      },
      authorId,
    );

    await createPrompt(
      {
        title: 'Flux Product Shot',
        shortDescription: 'A minimal product shot on a seamless backdrop.',
        promptText: 'Commercial product photography, seamless grey backdrop.',
        aiModel: 'flux',
        categoryId: otherCategoryId,
        style: 'Minimal',
        aspectRatio: '1:1',
        gender: 'non-human',
        difficulty: 'advanced',
        tags: ['product'],
        isPremium: true,
        isFeatured: false,
        isTrending: false,
        isEditorsPick: false,
        isPublished: true,
        exampleImages: [],
      },
      authorId,
    );
  });

  it('filters by AI model', async () => {
    const gemini = await listPrompts({ model: 'gemini' });
    expect(gemini.total).toBe(1);
    expect(gemini.items[0]?.aiModel).toBe('gemini');
  });

  it('filters by access tier', async () => {
    expect((await listPrompts({ access: 'free' })).total).toBe(1);
    expect((await listPrompts({ access: 'premium' })).total).toBe(1);
    expect((await listPrompts({ access: 'all' })).total).toBe(2);
  });

  it('filters by style, gender and aspect ratio', async () => {
    expect((await listPrompts({ style: 'Minimal' })).total).toBe(1);
    expect((await listPrompts({ gender: 'female' })).total).toBe(1);
    expect((await listPrompts({ aspect: '1:1' })).total).toBe(1);
  });

  it('filters by featured and trending flags', async () => {
    expect((await listPrompts({ featured: true })).total).toBe(1);
    expect((await listPrompts({ trending: true })).total).toBe(1);
  });

  it('filters by tag', async () => {
    expect((await listPrompts({ tag: 'saree' })).total).toBe(1);
    expect((await listPrompts({ tag: 'does-not-exist' })).total).toBe(0);
  });

  it('paginates and reports totals', async () => {
    const page = await listPrompts({ pageSize: 1, page: 1 });

    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);
    expect(page.totalPages).toBe(2);
    expect(page.hasMore).toBe(true);

    const second = await listPrompts({ pageSize: 1, page: 2 });
    expect(second.hasMore).toBe(false);
    expect(second.items[0]?.id).not.toBe(page.items[0]?.id);
  });
});

describe('search', () => {
  beforeEach(async () => {
    await createPrompt(
      {
        title: 'Cinematic Couple at Marine Drive',
        shortDescription: 'A candid couple portrait at dusk in Mumbai.',
        promptText: 'Cinematic photograph of a couple on the Marine Drive promenade.',
        aiModel: 'gemini',
        categoryId,
        style: 'Cinematic',
        difficulty: 'intermediate',
        tags: ['couple', 'mumbai'],
        isPremium: false,
        isFeatured: false,
        isTrending: false,
        isEditorsPick: false,
        isPublished: true,
        exampleImages: [],
      },
      authorId,
    );
  });

  it('matches on the title', async () => {
    const result = await searchPrompts({ query: 'couple', track: false });
    expect(result.total).toBe(1);
  });

  it('matches on prompt body text', async () => {
    const result = await searchPrompts({ query: 'promenade', track: false });
    expect(result.total).toBe(1);
  });

  it('matches on a tag', async () => {
    const result = await searchPrompts({ query: 'mumbai', track: false });
    expect(result.total).toBe(1);
  });

  it('is case-insensitive', async () => {
    const upper = await searchPrompts({ query: 'MARINE DRIVE', track: false });
    expect(upper.total).toBe(1);
  });

  it('returns nothing for an unmatched query', async () => {
    const result = await searchPrompts({ query: 'zzzznotathing', track: false });
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('ignores very short suggestion queries', async () => {
    expect(await suggest('a')).toHaveLength(0);
    expect(await suggest('')).toHaveLength(0);
  });

  it('suggests prompts, categories and models', async () => {
    const suggestions = await suggest('couple');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((item) => item.type === 'prompt')).toBe(true);

    const modelSuggestions = await suggest('gemini');
    expect(modelSuggestions.some((item) => item.type === 'model')).toBe(true);
  });
});

describe('trending recomputation', () => {
  it('flags the most engaged prompts as trending', async () => {
    const quiet = await createTestPrompt({ categoryId, authorId, title: 'Quiet Prompt' });
    const busy = await createTestPrompt({ categoryId, authorId, title: 'Busy Prompt' });

    const { getDb } = await import('@/db');
    const { prompts } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');

    await getDb()
      .update(prompts)
      .set({ viewCount: 900, copyCount: 300, likeCount: 200, favoriteCount: 150 })
      .where(eq(prompts.id, busy.id));

    const flagged = await recomputeTrending();
    expect(flagged).toBeGreaterThan(0);

    const trending = await listPrompts({ trending: true });
    const titles = trending.items.map((item) => item.title);
    expect(titles).toContain('Busy Prompt');
    void quiet;
  });
});
