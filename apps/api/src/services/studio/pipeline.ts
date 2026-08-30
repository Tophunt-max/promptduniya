import { categories, db, prompts } from '@pd/db';
import { eq } from 'drizzle-orm';

import { AppError } from '../../lib/errors';
import { nowSec } from '../../lib/dates';
import { createPrompt, setPromptPublished } from '../prompts';
import { generatePromptCover } from '../images/covers';
import { imageProviderStatus } from '../images';
import { assertBriefValid, draftPrompt, type StudioBrief } from './blueprint';
import { findDuplicate, type DuplicateMatch } from './duplicates';
import { scorePrompt, type QualityReport } from './quality';
import { textProviderStatus } from './text';

/**
 * The content pipeline: idea in, published prompt with a cover out.
 *
 * Six steps, and the ordering matters:
 *
 *   1. write the prompt record with a language model
 *   2. check it is not a near-duplicate of something already in the catalogue
 *   3. insert it as an unpublished draft
 *   4. generate its cover image from the record just written
 *   5. score it against the house style
 *   6. publish, schedule, or hold it for review
 *
 * The duplicate check sits before the insert so a rediscovered topic never
 * reaches the catalogue at all. It cannot run any earlier than this — the check
 * compares written prompts, and until step 1 there is nothing to compare — so a
 * duplicate still costs one model call. `themeAlreadyUsed` in duplicates.ts is
 * the cheaper pre-flight the runner uses to avoid most of them before spending
 * anything.
 *
 * The draft is saved before the cover is generated for two reasons. The cover
 * generator reads the stored columns to build its image instruction, so the row
 * has to exist first. And if image generation fails — a daily quota, a safety
 * filter — the written prompt survives as a draft rather than being thrown away
 * along with the failure. A prompt with no cover is worth keeping; several
 * minutes of model output that vanished is not.
 *
 * Quality scoring happens after the cover so the score can account for whether
 * an example image actually exists, which is a real part of whether the post is
 * publishable. It gates publication only: a low-scoring prompt is still saved,
 * still visible in the console, and still one click from being published by a
 * human who disagrees with the score.
 *
 * Publishing happens last so nothing reaches the public site half-built.
 *
 * One item per call. Generation takes tens of seconds, so the caller drives the
 * loop — the admin client for a hand-run batch, `automation/runner.ts` for an
 * unattended one — and a failure on item eight then costs one item rather than
 * the whole batch.
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

  /* ---- Gates. Off by default so the manual studio behaves as it always did. ---- */

  /**
   * Refuse to publish below this score, holding the prompt as a draft instead.
   * Undefined disables the gate; the prompt is still scored and the score is
   * still returned, because the number is useful even when it decides nothing.
   */
  minQualityScore?: number;
  /** Reject near-duplicates outright. Undefined disables the check entirely. */
  duplicateThreshold?: number;
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
  /** Always present — scoring is cheap and the number is always worth having. */
  quality: QualityReport;
  /** True when the quality gate stopped this from publishing. */
  heldForReview: boolean;
  /** Why it was held, ready to show in the console. */
  holdReason: string | null;
}

/**
 * Thrown when the duplicate gate rejects a draft before it is saved.
 *
 * A distinct error type rather than a result field because there is no prompt to
 * return — nothing was inserted — and the caller needs the match to record which
 * existing prompt it collided with.
 */
export class DuplicateContentError extends Error {
  readonly match: DuplicateMatch;
  readonly threshold: number;

  constructor(match: DuplicateMatch, threshold: number) {
    super(
      `This is a near-duplicate of "${match.title}" (${match.score}% similar, threshold ${threshold}%).`,
    );
    this.name = 'DuplicateContentError';
    this.match = match;
    this.threshold = threshold;
  }
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

  /* 2. Duplicate gate — before anything is persisted. */
  if (input.duplicateThreshold !== undefined) {
    const verdict = await findDuplicate({
      title: draft.title,
      promptText: draft.promptText,
      tags: draft.tags,
      threshold: input.duplicateThreshold,
    });

    if (verdict.isDuplicate && verdict.match) {
      throw new DuplicateContentError(verdict.match, verdict.threshold);
    }
  }

  /* 3. Save it as a draft. */
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
      // Always inserted unpublished; step 6 decides what happens next.
      isPublished: false,
      scheduledFor: null,
      seoTitle: draft.seoTitle || undefined,
      seoDescription: draft.seoDescription || undefined,
      exampleImages: [],
    },
    input.authorId,
  );

  if (!created) throw AppError.badRequest('The prompt could not be saved');

  /* 4. Cover. Never fatal — the draft is already safe. */
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

  /* 5. Score it. */
  const quality = scorePrompt({
    draft,
    inputMode: input.inputMode,
    hasCover: Boolean(coverUrl),
    // Not penalised for a missing image when no image was ever attempted.
    coverRequired: !input.skipCover,
  });

  /* 6. Publish, schedule, or hold. */
  const gateActive = input.minQualityScore !== undefined;
  const failsGate = gateActive && (quality.blocked || quality.score < input.minQualityScore!);

  let published = false;
  let scheduledFor: number | null = null;
  let holdReason: string | null = null;

  if (failsGate) {
    holdReason = quality.blocked
      ? quality.summary
      : `Scored ${quality.score}, below the ${input.minQualityScore} threshold. Failed: ${
          quality.failed.slice(0, 3).join('; ') || 'unknown'
        }.`;
  } else if (input.publishMode === 'publish') {
    await setPromptPublished(created.id, true);
    published = true;
  } else if (input.publishMode === 'schedule') {
    // Maintenance publishes anything whose scheduledFor has passed, so this only
    // has to record the date.
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
    quality,
    heldForReview: failsGate,
    holdReason,
  };
}

/**
 * Everything the studio screen needs to explain itself before a run.
 *
 * Async since provider configuration moved into the database. The two status
 * calls are independent, so they run together.
 */
export async function studioStatus() {
  const [text, image] = await Promise.all([textProviderStatus(), imageProviderStatus()]);
  return {
    text,
    image,
    ready: (text.workersAi || text.gemini || text.openai) && (image.workersAi || image.gemini),
  };
}
