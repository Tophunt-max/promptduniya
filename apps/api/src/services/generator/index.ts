import { db, generatedPrompts } from '@pd/db';
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
  pick,
  type GeneratorInput,
} from '@pd/shared';
import { and, desc, eq } from 'drizzle-orm';

import { AppError } from '../../lib/errors';
import { dayBucket } from '../../lib/dates';
import { newId } from '../../lib/crypto';
import { generatorUsage, hasFeature, type AccessContext, type UsageStatus } from '../entitlements';
import { resolveEngine } from './ai-engine';
import { templateEngine } from './template-engine';
import type { GeneratedResult } from './types';

export interface GenerateOutcome extends GeneratedResult {
  id: string;
  usage: UsageStatus;
  aiModel: string;
}

/** Advanced generation with server-side quota + entitlement enforcement. */
export async function generatePrompt(input: {
  access: AccessContext;
  visitorHash: string | null;
  form: GeneratorInput;
  mode?: 'advanced' | 'random';
}): Promise<GenerateOutcome> {
  const { access, form } = input;

  const before = await generatorUsage(access, input.visitorHash);
  if (!before.allowed) {
    throw AppError.limitReached(
      access.isAuthenticated
        ? `You've used all ${before.limit} generator runs today. Upgrade to Premium for unlimited generations.`
        : `Guests get ${before.limit} generator runs per day. Create a free account to continue.`,
      { limit: before.limit, used: before.used, upgrade: access.isAuthenticated ? '/premium' : '/register' },
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

  const usage = await generatorUsage(access, input.visitorHash);
  return { ...result, id, usage, aiModel: form.aiModel };
}

export interface RandomSeed extends GeneratorInput {
  imageType: string;
}

export function randomBrief(preferredModel?: string): RandomSeed {
  const model =
    preferredModel && AI_MODEL_IDS.includes(preferredModel as never) ? preferredModel : pick(AI_MODEL_IDS);
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

export async function saveGenerated(userId: string, generatedId: string, title?: string): Promise<void> {
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

export async function listGenerated(userId: string, options: { savedOnly?: boolean; limit?: number } = {}) {
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

export { resolveEngine, aiConfigured } from './ai-engine';
export type { GeneratedResult } from './types';


export async function unsaveGenerated(userId: string, generatedId: string): Promise<void> {
  await db
    .update(generatedPrompts)
    .set({ isSaved: false })
    .where(and(eq(generatedPrompts.id, generatedId), eq(generatedPrompts.userId, userId)));
}

export async function deleteGenerated(userId: string, generatedId: string): Promise<void> {
  await db
    .delete(generatedPrompts)
    .where(and(eq(generatedPrompts.id, generatedId), eq(generatedPrompts.userId, userId)));
}

/** Lifetime and today's generator counts for the dashboard. */
export async function generatorStats(userId: string) {
  const rows = await db
    .select({
      id: generatedPrompts.id,
      isSaved: generatedPrompts.isSaved,
      day: generatedPrompts.dayBucket,
      createdAt: generatedPrompts.createdAt,
    })
    .from(generatedPrompts)
    .where(eq(generatedPrompts.userId, userId));

  const today = dayBucket();
  return {
    total: rows.length,
    saved: rows.filter((r) => r.isSaved).length,
    today: rows.filter((r) => r.day === today).length,
    lastRunAt: rows.reduce<number | null>(
      (latest, row) => (latest === null || row.createdAt > latest ? row.createdAt : latest),
      null,
    ),
  };
}
