import { db, favorites, likes, promptCopies, prompts } from '@pd/db';
import { FEATURES } from '@pd/shared';
import { and, eq, sql } from 'drizzle-orm';

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
