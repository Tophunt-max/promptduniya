import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { generatedPrompts } from '@/db/schema';
import { AppError } from '@/lib/api';
import {
  AI_MODEL_IDS,
  ASPECT_RATIOS,
  BACKGROUNDS,
  CAMERA_STYLES,
  COLOR_TONES,
  EXPRESSIONS,
  FEATURES,
  IMAGE_TYPES,
  LIGHTING,
  LOCATIONS,
  MOODS,
  OUTFITS,
  POSES,
  STYLES,
} from '@/lib/constants';
import { dayBucket, nowSec } from '@/lib/dates';
import { newId } from '@/lib/id';
import { pick } from '@/lib/utils';
import type { GeneratorInput } from '@/lib/validation';
import { trackEvent } from '../analytics';
import { generatorUsage, hasFeature, type AccessContext, type UsageStatus } from '../entitlements';
import { resolveEngine } from './ai-engine';
import { templateEngine } from './template-engine';
import type { GeneratedResult } from './types';

export type { GeneratedResult } from './types';
export { resolveEngine, engineName } from './ai-engine';

export interface GenerateOutcome extends GeneratedResult {
  id: string;
  usage: UsageStatus;
  aiModel: string;
}

/**
 * Runs the generator with server-side quota enforcement.
 *
 * `useAi` is only honoured for members who actually hold the advanced generator
 * entitlement; everyone else transparently gets the template engine, which
 * produces a complete, usable prompt.
 */
export async function generatePrompt(input: {
  access: AccessContext;
  visitorHash: string | null;
  form: GeneratorInput;
  mode?: 'advanced' | 'random';
}): Promise<GenerateOutcome> {
  const { access, form } = input;

  const usageBefore = await generatorUsage(access, input.visitorHash);
  if (!usageBefore.allowed) {
    throw AppError.limitReached(
      access.isAuthenticated
        ? `You've used all ${usageBefore.limit} generator runs for today. Upgrade to Premium for unlimited generations.`
        : `Guests get ${usageBefore.limit} generator runs per day. Create a free account to continue.`,
      {
        limit: usageBefore.limit,
        used: usageBefore.used,
        upgrade: access.isAuthenticated ? '/premium' : '/register',
      },
    );
  }

  const canUseAi = hasFeature(access, FEATURES.advancedGenerator);
  const engine = form.useAi && canUseAi ? resolveEngine() : templateEngine;
  const result = await engine.generate(form);

  const id = newId();
  await db.insert(generatedPrompts).values({
    id,
    userId: access.userId,
    visitorHash: input.visitorHash,
    mode: input.mode ?? 'advanced',
    aiModel: form.aiModel,
    inputJson: JSON.stringify(form).slice(0, 4000),
    output: result.prompt,
    negativeOutput: result.negativePrompt || null,
    engine: result.engine,
    title: result.title,
    dayBucket: dayBucket(),
  });

  await trackEvent({
    name: 'generator.run',
    userId: access.userId,
    visitorHash: input.visitorHash,
    props: { model: form.aiModel, engine: result.engine, mode: input.mode ?? 'advanced' },
  });

  const usage = await generatorUsage(access, input.visitorHash);
  return { ...result, id, usage, aiModel: form.aiModel };
}

/* ---------------------------- Random generator ----------------------------- */

export interface RandomSeed extends GeneratorInput {
  imageType: string;
}

/** Builds a fully-random brief; every field is filled so nothing looks empty. */
export function randomBrief(preferredModel?: string): RandomSeed {
  const model = preferredModel && AI_MODEL_IDS.includes(preferredModel as never)
    ? preferredModel
    : pick(AI_MODEL_IDS);

  return {
    aiModel: model,
    imageType: pick(IMAGE_TYPES),
    subject: '',
    gender: pick(['any', 'male', 'female', 'couple'] as const),
    style: pick(STYLES),
    location: pick(LOCATIONS),
    outfit: pick(OUTFITS),
    pose: pick(POSES),
    expression: pick(EXPRESSIONS),
    lighting: pick(LIGHTING),
    camera: pick(CAMERA_STYLES),
    background: pick(BACKGROUNDS),
    mood: pick(MOODS),
    colorTone: pick(COLOR_TONES),
    aspectRatio: pick(ASPECT_RATIOS).id,
    quality: pick(['standard', 'high', 'ultra'] as const),
    additionalInstructions: '',
    useAi: false,
  };
}

export async function generateRandom(input: {
  access: AccessContext;
  visitorHash: string | null;
  aiModel?: string;
}): Promise<GenerateOutcome & { brief: RandomSeed }> {
  const brief = randomBrief(input.aiModel);
  const outcome = await generatePrompt({
    access: input.access,
    visitorHash: input.visitorHash,
    form: brief,
    mode: 'random',
  });
  return { ...outcome, brief };
}

/* ------------------------------ Saved history ------------------------------ */

export async function saveGenerated(
  userId: string,
  generatedId: string,
  title?: string,
): Promise<void> {
  const rows = await db
    .select({ id: generatedPrompts.id, userId: generatedPrompts.userId })
    .from(generatedPrompts)
    .where(eq(generatedPrompts.id, generatedId))
    .limit(1);

  const row = rows[0];
  if (!row) throw AppError.notFound('That generated prompt no longer exists');
  if (row.userId && row.userId !== userId) throw AppError.forbidden();

  await db
    .update(generatedPrompts)
    .set({ isSaved: true, userId, title: title ?? undefined })
    .where(eq(generatedPrompts.id, generatedId));
}

export async function unsaveGenerated(userId: string, generatedId: string): Promise<void> {
  await db
    .update(generatedPrompts)
    .set({ isSaved: false })
    .where(and(eq(generatedPrompts.id, generatedId), eq(generatedPrompts.userId, userId)));
}

export async function listGenerated(
  userId: string,
  options: { savedOnly?: boolean; limit?: number } = {},
) {
  const filters = [eq(generatedPrompts.userId, userId)];
  if (options.savedOnly) filters.push(eq(generatedPrompts.isSaved, true));

  return db
    .select({
      id: generatedPrompts.id,
      title: generatedPrompts.title,
      output: generatedPrompts.output,
      negativeOutput: generatedPrompts.negativeOutput,
      aiModel: generatedPrompts.aiModel,
      mode: generatedPrompts.mode,
      engine: generatedPrompts.engine,
      isSaved: generatedPrompts.isSaved,
      createdAt: generatedPrompts.createdAt,
    })
    .from(generatedPrompts)
    .where(and(...filters))
    .orderBy(desc(generatedPrompts.createdAt))
    .limit(options.limit ?? 50);
}

export async function deleteGenerated(userId: string, generatedId: string): Promise<void> {
  await db
    .delete(generatedPrompts)
    .where(and(eq(generatedPrompts.id, generatedId), eq(generatedPrompts.userId, userId)));
}

export async function generatorStats(userId: string) {
  const rows = await db
    .select({ id: generatedPrompts.id, isSaved: generatedPrompts.isSaved, day: generatedPrompts.dayBucket })
    .from(generatedPrompts)
    .where(eq(generatedPrompts.userId, userId));

  const today = dayBucket();
  return {
    total: rows.length,
    saved: rows.filter((r) => r.isSaved).length,
    today: rows.filter((r) => r.day === today).length,
    lastRunAt: rows.length > 0 ? nowSec() : null,
  };
}
