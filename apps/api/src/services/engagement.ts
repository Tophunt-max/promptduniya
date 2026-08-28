import { categories, db, favorites, likes, promptCopies, prompts } from '@pd/db';
import { FEATURES } from '@pd/shared';
import { and, count, desc, eq, sql } from 'drizzle-orm';

import { AppError } from '../lib/errors';
import { dayBucket } from '../lib/dates';
import { newId } from '../lib/crypto';
import {
  copyUsage,
  favoriteUsage,
  hasFeature,
  type AccessContext,
  type UsageStatus,
} from './entitlements';

/**
 * Copy / like / favourite. The copy endpoint is the single gate that releases a
 * prompt body — premium entitlement and the daily quota are both enforced here,
 * which is why bodies are never present in list payloads.
 */

export interface CopyResult {
  promptText: string;
  negativePrompt: string | null;
  usageInstructions: string | null;
  formatted?: string;
  usage: UsageStatus;
  copyCount: number;
}

export async function copyPrompt(input: {
  access: AccessContext;
  visitorHash: string | null;
  promptId: string;
  variant: 'plain' | 'instructions' | 'download';
}): Promise<CopyResult> {
  const { access, promptId, variant } = input;

  const rows = await db
    .select({
      id: prompts.id,
      promptText: prompts.promptText,
      negativePrompt: prompts.negativePrompt,
      usageInstructions: prompts.usageInstructions,
      isPremium: prompts.isPremium,
      isPublished: prompts.isPublished,
      title: prompts.title,
      aiModel: prompts.aiModel,
      copyCount: prompts.copyCount,
    })
    .from(prompts)
    .where(eq(prompts.id, promptId))
    .limit(1);

  const prompt = rows[0];
  if (!prompt || !prompt.isPublished) throw AppError.notFound('Prompt not found');

  if (prompt.isPremium && !hasFeature(access, FEATURES.premiumPrompts)) {
    throw AppError.paymentRequired('This is a premium prompt. Upgrade your membership to copy it.');
  }

  const before = await copyUsage(access, input.visitorHash);
  if (!before.allowed) {
    throw AppError.limitReached(
      access.isAuthenticated
        ? `You've used all ${before.limit} free copies today. Upgrade to Premium for unlimited copies.`
        : `Guests can copy ${before.limit} prompts per day. Create a free account to copy more.`,
      { limit: before.limit, used: before.used, upgrade: access.isAuthenticated ? '/premium' : '/register' },
    );
  }

  await db.insert(promptCopies).values({
    id: newId(),
    promptId,
    userId: access.userId,
    visitorHash: input.visitorHash,
    variant,
    dayBucket: dayBucket(),
  });
  await db
    .update(prompts)
    .set({ copyCount: sql`${prompts.copyCount} + 1` })
    .where(eq(prompts.id, promptId));

  const usage = await copyUsage(access, input.visitorHash);
  const formatted =
    variant !== 'plain'
      ? withInstructions({
          title: prompt.title,
          aiModel: prompt.aiModel,
          promptText: prompt.promptText,
          negativePrompt: prompt.negativePrompt,
          usageInstructions: prompt.usageInstructions,
        })
      : undefined;

  return {
    promptText: prompt.promptText,
    negativePrompt: prompt.negativePrompt,
    usageInstructions: prompt.usageInstructions,
    formatted,
    usage,
    copyCount: prompt.copyCount + 1,
  };
}

export function withInstructions(input: {
  title: string;
  aiModel: string;
  promptText: string;
  negativePrompt: string | null;
  usageInstructions: string | null;
}): string {
  const lines = [`# ${input.title}`, '', '## Prompt', input.promptText];
  if (input.negativePrompt) lines.push('', '## Negative prompt', input.negativePrompt);
  if (input.usageInstructions) lines.push('', '## How to use', input.usageInstructions);
  lines.push('', '## Notes', `- Written and tested for: ${input.aiModel}`);
  return lines.join('\n');
}

export async function toggleLike(userId: string, promptId: string) {
  const promptRows = await db
    .select({ id: prompts.id, isPublished: prompts.isPublished })
    .from(prompts)
    .where(eq(prompts.id, promptId))
    .limit(1);
  if (!promptRows[0]?.isPublished) throw AppError.notFound('Prompt not found');

  const existing = await db
    .select({ userId: likes.userId })
    .from(likes)
    .where(and(eq(likes.userId, userId), eq(likes.promptId, promptId)))
    .limit(1);

  if (existing.length > 0) {
    await db.delete(likes).where(and(eq(likes.userId, userId), eq(likes.promptId, promptId)));
    await db.update(prompts).set({ likeCount: sql`max(0, ${prompts.likeCount} - 1)` }).where(eq(prompts.id, promptId));
  } else {
    await db.insert(likes).values({ userId, promptId }).onConflictDoNothing();
    await db.update(prompts).set({ likeCount: sql`${prompts.likeCount} + 1` }).where(eq(prompts.id, promptId));
  }

  const counts = await db.select({ likeCount: prompts.likeCount }).from(prompts).where(eq(prompts.id, promptId)).limit(1);
  return { liked: existing.length === 0, likeCount: counts[0]?.likeCount ?? 0 };
}

export async function toggleFavorite(access: AccessContext, promptId: string) {
  if (!access.userId) throw AppError.unauthorized('Sign in to save prompts');

  const promptRows = await db
    .select({ id: prompts.id, isPublished: prompts.isPublished })
    .from(prompts)
    .where(eq(prompts.id, promptId))
    .limit(1);
  if (!promptRows[0]?.isPublished) throw AppError.notFound('Prompt not found');

  const existing = await db
    .select({ userId: favorites.userId })
    .from(favorites)
    .where(and(eq(favorites.userId, access.userId), eq(favorites.promptId, promptId)))
    .limit(1);

  if (existing.length > 0) {
    await db.delete(favorites).where(and(eq(favorites.userId, access.userId), eq(favorites.promptId, promptId)));
    await db.update(prompts).set({ favoriteCount: sql`max(0, ${prompts.favoriteCount} - 1)` }).where(eq(prompts.id, promptId));
  } else {
    const usage = await favoriteUsage(access);
    if (!usage.allowed && !hasFeature(access, FEATURES.unlimitedFavorites)) {
      throw AppError.limitReached(
        `You've saved ${usage.limit} prompts on the free plan. Upgrade to Premium for unlimited favourites.`,
        { limit: usage.limit, used: usage.used, upgrade: '/premium' },
      );
    }
    await db.insert(favorites).values({ userId: access.userId, promptId }).onConflictDoNothing();
    await db.update(prompts).set({ favoriteCount: sql`${prompts.favoriteCount} + 1` }).where(eq(prompts.id, promptId));
  }

  const usage = await favoriteUsage(access);
  return { saved: existing.length === 0, usage };
}


/* ======================== Library listings =========================== */

export type FavoriteSort = 'recent' | 'oldest' | 'title' | 'most-copied';

export interface FavoriteRow {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  aiModel: string;
  categoryName: string;
  categorySlug: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  isPremium: boolean;
  isTrending: boolean;
  difficulty: string;
  style: string | null;
  aspectRatio: string | null;
  gender: string | null;
  isFeatured: boolean;
  isEditorsPick: boolean;
  viewCount: number;
  copyCount: number;
  likeCount: number;
  favoriteCount: number;
  publishedAt: number | null;
  createdAt: number;
  savedAt: number;
  collectionName: string | null;
  note: string | null;
}

export async function listFavorites(
  userId: string,
  options: { sort?: FavoriteSort; q?: string; model?: string; access?: string; limit?: number } = {},
): Promise<FavoriteRow[]> {
  const filters = [eq(favorites.userId, userId)];
  if (options.model) filters.push(eq(prompts.aiModel, options.model));
  if (options.access === 'free') filters.push(eq(prompts.isPremium, false));
  if (options.access === 'premium') filters.push(eq(prompts.isPremium, true));
  if (options.q) {
    filters.push(sql`lower(${prompts.title}) like ${`%${options.q.toLowerCase()}%`}`);
  }

  const order = (() => {
    switch (options.sort) {
      case 'oldest':
        return favorites.createdAt;
      case 'title':
        return prompts.title;
      case 'most-copied':
        return desc(prompts.copyCount);
      default:
        return desc(favorites.createdAt);
    }
  })();

  return db
    .select({
      id: prompts.id,
      title: prompts.title,
      slug: prompts.slug,
      shortDescription: prompts.shortDescription,
      aiModel: prompts.aiModel,
      categoryName: categories.name,
      categorySlug: categories.slug,
      coverImageUrl: prompts.coverImageUrl,
      coverImageAlt: prompts.coverImageAlt,
      isPremium: prompts.isPremium,
      isTrending: prompts.isTrending,
      difficulty: prompts.difficulty,
      style: prompts.style,
      aspectRatio: prompts.aspectRatio,
      gender: prompts.gender,
      isFeatured: prompts.isFeatured,
      isEditorsPick: prompts.isEditorsPick,
      viewCount: prompts.viewCount,
      copyCount: prompts.copyCount,
      likeCount: prompts.likeCount,
      favoriteCount: prompts.favoriteCount,
      publishedAt: prompts.publishedAt,
      createdAt: prompts.createdAt,
      savedAt: favorites.createdAt,
      collectionName: favorites.collectionName,
      note: favorites.note,
    })
    .from(favorites)
    .innerJoin(prompts, eq(prompts.id, favorites.promptId))
    .innerJoin(categories, eq(categories.id, prompts.categoryId))
    .where(and(...filters))
    .orderBy(order)
    .limit(options.limit ?? 200);
}

export async function removeFavorite(userId: string, promptId: string): Promise<void> {
  const existing = await db
    .select({ promptId: favorites.promptId })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.promptId, promptId)))
    .limit(1);
  if (existing.length === 0) return;

  await db
    .delete(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.promptId, promptId)));
  await db
    .update(prompts)
    .set({ favoriteCount: sql`max(0, ${prompts.favoriteCount} - 1)` })
    .where(eq(prompts.id, promptId));
}

export async function listLikedPrompts(userId: string, limit = 60) {
  return db
    .select({
      id: prompts.id,
      title: prompts.title,
      slug: prompts.slug,
      shortDescription: prompts.shortDescription,
      aiModel: prompts.aiModel,
      categoryName: categories.name,
      categorySlug: categories.slug,
      coverImageUrl: prompts.coverImageUrl,
      coverImageAlt: prompts.coverImageAlt,
      isPremium: prompts.isPremium,
      likeCount: prompts.likeCount,
      copyCount: prompts.copyCount,
      viewCount: prompts.viewCount,
      likedAt: likes.createdAt,
    })
    .from(likes)
    .innerJoin(prompts, eq(prompts.id, likes.promptId))
    .innerJoin(categories, eq(categories.id, prompts.categoryId))
    .where(eq(likes.userId, userId))
    .orderBy(desc(likes.createdAt))
    .limit(limit);
}

export async function userEngagementStats(userId: string) {
  const single = async (q: Promise<{ value: number }[]>) => Number((await q)[0]?.value ?? 0);

  const [copies, saves, likesCount, copiesToday] = await Promise.all([
    single(db.select({ value: count() }).from(promptCopies).where(eq(promptCopies.userId, userId))),
    single(db.select({ value: count() }).from(favorites).where(eq(favorites.userId, userId))),
    single(db.select({ value: count() }).from(likes).where(eq(likes.userId, userId))),
    single(
      db
        .select({ value: count() })
        .from(promptCopies)
        .where(and(eq(promptCopies.userId, userId), eq(promptCopies.dayBucket, dayBucket()))),
    ),
  ]);

  return { copies, saves, likes: likesCount, copiesToday };
}

export async function recentCopyActivity(userId: string, limit = 10) {
  return db
    .select({
      promptId: promptCopies.promptId,
      title: prompts.title,
      slug: prompts.slug,
      variant: promptCopies.variant,
      createdAt: promptCopies.createdAt,
    })
    .from(promptCopies)
    .innerJoin(prompts, eq(prompts.id, promptCopies.promptId))
    .where(eq(promptCopies.userId, userId))
    .orderBy(desc(promptCopies.createdAt))
    .limit(limit);
}
