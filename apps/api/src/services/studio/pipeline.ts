import { categories, db, prompts } from '@pd/db';
import { eq } from 'drizzle-orm';

import { AppError } from '../../lib/errors';
import { nowSec } from '../../lib/dates';
import { createPrompt, setPromptPublished } from '../prompts';
import { generatePromptCover } from '../images/covers';
import { imageProviderStatus } from '../images';
import { assertBriefValid, draftPrompt, type StudioBrief } from './blueprint';
import { textProviderStatus } from './text';

/**
 * The content pipeline: idea in, published prompt with a cover out.
 *
 * Four steps, and the ordering matters:
 *
 *   1. write the prompt record with a language model
 *   2. insert it as an unpublished draft
 *   3. generate its cover image from the record just written
 *   4. publish, schedule, or leave it as a draft
 *
 * The draft is saved *before* the cover is generated for two reasons. The cover
 * generator reads the stored columns to build its image instruction, so the row
 * has to exist first. And if image generation fails — a daily quota, a safety
 * filter — the written prompt survives as a draft rather than being thrown away
 * along with the failure. A prompt with no cover is worth keeping; several
 * minutes of model output that vanished is not.
 *
 * Publishing happens last so nothing reaches the public site half-built.
 *
 * One item per call. Generation takes tens of seconds, so the admin client
 * drives the loop and reports progress; a failure on item eight then costs one
 * item rather than the whole batch.
 */

export type PublishMode = 'draft' | 'publish' | 'schedule';

export interface StudioRunInput {
  theme: string;
  categoryId: string;
  aiModel: string;
  inputMode: string;
  isPremium: boolean;
  publishMode: PublishMode;
  /** Unix seconds. Only read when publishMode is 'schedule'. */
  scheduledFor?: number | null;
  /** Skip the image step — useful when an image quota is exhausted. */
  skipCover?: boolean;
  authorId: string | null;
}

export interface StudioRunResult {
  promptId: string;
  slug: string;
  title: string;
  published: boolean;
  scheduledFor: number | null;
  coverUrl: string | null;
  /** Present when the prompt saved but its cover did not. */
  coverError: string | null;
  textEngine: string;
  imageEngine: string | null;
}

export async function runStudioPipeline(input: StudioRunInput): Promise<StudioRunResult> {
  const category = await db
    .select({ id: categories.id, slug: categories.slug, name: categories.name })
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .limit(1);

  const target = category[0];
  if (!target) throw AppError.badRequest('Unknown category');

  const brief: StudioBrief = {
    theme: input.theme,
    categorySlug: target.slug,
    categoryName: target.name,
    aiModel: input.aiModel,
    inputMode: input.inputMode,
    isPremium: input.isPremium,
  };
  assertBriefValid(brief);

  /* 1. Write it. */
  const draft = await draftPrompt(brief);

  /* 2. Save it as a draft. */
  const created = await createPrompt(
    {
      title: draft.title,
      shortDescription: draft.shortDescription,
      promptText: draft.promptText,
      negativePrompt: draft.negativePrompt || undefined,
      usageInstructions: draft.usageInstructions || undefined,
      aiModel: input.aiModel,
      inputMode: input.inputMode,
      categoryId: target.id,
      style: draft.style,
      gender: draft.gender,
      ageGroup: draft.ageGroup,
      location: draft.location || undefined,
      aspectRatio: draft.aspectRatio,
      cameraStyle: draft.cameraStyle || undefined,
      lighting: draft.lighting || undefined,
      mood: draft.mood || undefined,
      difficulty: draft.difficulty,
      tags: draft.tags,
      isPremium: input.isPremium,
      isFeatured: false,
      isTrending: false,
      isEditorsPick: false,
      // Always inserted unpublished; step 4 decides what happens next.
      isPublished: false,
      scheduledFor: null,
      seoTitle: draft.seoTitle || undefined,
      seoDescription: draft.seoDescription || undefined,
      exampleImages: [],
    },
    input.authorId,
  );

  if (!created) throw AppError.badRequest('The prompt could not be saved');

  /* 3. Cover. Never fatal — the draft is already safe. */
  let coverUrl: string | null = null;
  let coverError: string | null = null;
  let imageEngine: string | null = null;

  if (!input.skipCover) {
    try {
      const cover = await generatePromptCover(created.id, { force: true });
      coverUrl = cover.url;
      imageEngine = cover.engine;
    } catch (error) {
      coverError = error instanceof Error ? error.message : String(error);
    }
  }

  /* 4. Publish, schedule, or leave alone. */
  let published = false;
  let scheduledFor: number | null = null;

  if (input.publishMode === 'publish') {
    await setPromptPublished(created.id, true);
    published = true;
  } else if (input.publishMode === 'schedule') {
    // The nightly maintenance job publishes anything whose scheduledFor has
    // passed, so this only has to record the date.
    scheduledFor = input.scheduledFor ?? nowSec() + 86_400;
    await db
      .update(prompts)
      .set({ scheduledFor, updatedAt: nowSec() })
      .where(eq(prompts.id, created.id));
  }

  return {
    promptId: created.id,
    slug: created.slug,
    title: created.title,
    published,
    scheduledFor,
    coverUrl,
    coverError,
    textEngine: draft.engine,
    imageEngine,
  };
}

/** Everything the studio screen needs to explain itself before a run. */
export function studioStatus() {
  const text = textProviderStatus();
  const image = imageProviderStatus();
  return {
    text,
    image,
    ready: (text.workersAi || text.gemini || text.openai) && (image.workersAi || image.gemini),
  };
}
