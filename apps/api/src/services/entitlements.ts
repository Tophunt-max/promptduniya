import {
  db,
  entitlements,
  favorites,
  generatedPrompts,
  plans,
  promptCopies,
  subscriptions,
  users,
} from '@pd/db';
import { FEATURES, SETTING_KEYS, type FeatureKey, type SerializedAccess } from '@pd/shared';
import { and, count, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';

import { AppError } from '../lib/errors';
import { dayBucket, nowSec } from '../lib/dates';
import { newId } from '../lib/crypto';
import { getNumberSetting } from './settings';

/**
 * Entitlement resolution — the security core, unchanged in spirit from the
 * monolith. Premium access is computed from subscription state on every call,
 * never read from a stored boolean.
 */

export interface PlanLimits {
  copiesPerDay: number;
  favorites: number;
  generatorPerDay: number;
  [key: string]: number;
}

export interface AccessContext {
  userId: string | null;
  isAuthenticated: boolean;
  isPremium: boolean;
  planCode: string;
  planName: string;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  subscriptionEndsAt: number | null;
  autoRenew: boolean;
  limits: PlanLimits;
  features: Set<string>;
}

/** JSON-safe projection sent to the website/admin over HTTP. */
export function serializeAccess(access: AccessContext): SerializedAccess {
  return {
    userId: access.userId,
    isAuthenticated: access.isAuthenticated,
    isPremium: access.isPremium,
    planCode: access.planCode,
    planName: access.planName,
    subscriptionId: access.subscriptionId,
    subscriptionStatus: access.subscriptionStatus,
    subscriptionEndsAt: access.subscriptionEndsAt,
    autoRenew: access.autoRenew,
    limits: { ...access.limits },
    features: [...access.features],
  };
}

const ACTIVE_STATUSES = ['active', 'past_due'] as const;

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function getActiveSubscription(userId: string) {
  const rows = await db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      endDate: subscriptions.endDate,
      planCode: plans.code,
      planName: plans.name,
      planLimits: plans.limitsJson,
      autoRenew: subscriptions.autoRenew,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(
      and(
        eq(subscriptions.userId, userId),
        inArray(subscriptions.status, [...ACTIVE_STATUSES]),
        or(isNull(subscriptions.endDate), gt(subscriptions.endDate, nowSec())),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Explicit feature grants, joined against their subscription so a cancelled or
 * expired subscription revokes the grant immediately (the fix found by tests in
 * the monolith).
 */
async function getFeatureGrants(userId: string): Promise<Map<string, number>> {
  const now = nowSec();
  const rows = await db
    .select({
      feature: entitlements.feature,
      quota: entitlements.quota,
      subscriptionId: entitlements.subscriptionId,
      subStatus: subscriptions.status,
      subEnd: subscriptions.endDate,
    })
    .from(entitlements)
    .leftJoin(subscriptions, eq(subscriptions.id, entitlements.subscriptionId))
    .where(
      and(
        eq(entitlements.userId, userId),
        isNull(entitlements.revokedAt),
        or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
        or(isNull(entitlements.startsAt), sql`${entitlements.startsAt} <= ${now}`),
      ),
    );

  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.subscriptionId) {
      const statusOk =
        row.subStatus !== null && (ACTIVE_STATUSES as readonly string[]).includes(row.subStatus);
      const windowOk = row.subEnd === null || row.subEnd > now;
      if (!statusOk || !windowOk) continue;
    }
    map.set(row.feature, row.quota);
  }
  return map;
}

const PREMIUM_FEATURES: FeatureKey[] = [
  FEATURES.premiumPrompts,
  FEATURES.unlimitedCopies,
  FEATURES.unlimitedFavorites,
  FEATURES.advancedGenerator,
  FEATURES.adFree,
  FEATURES.premiumCollections,
  FEATURES.hdAssets,
  FEATURES.prioritySupport,
];

async function anonLimits(): Promise<PlanLimits> {
  return {
    copiesPerDay: await getNumberSetting(SETTING_KEYS.anonCopiesPerDay, 3),
    favorites: 0,
    generatorPerDay: await getNumberSetting(SETTING_KEYS.anonGeneratorPerDay, 3),
  };
}
async function freeLimits(): Promise<PlanLimits> {
  return {
    copiesPerDay: await getNumberSetting(SETTING_KEYS.freeCopiesPerDay, 10),
    favorites: await getNumberSetting(SETTING_KEYS.freeFavorites, 25),
    generatorPerDay: await getNumberSetting(SETTING_KEYS.freeGeneratorPerDay, 10),
  };
}
async function premiumFallbackLimits(): Promise<PlanLimits> {
  return {
    copiesPerDay: await getNumberSetting(SETTING_KEYS.premiumCopiesPerDay, -1),
    favorites: await getNumberSetting(SETTING_KEYS.premiumFavorites, -1),
    generatorPerDay: await getNumberSetting(SETTING_KEYS.premiumGeneratorPerDay, -1),
  };
}

export async function resolveAccess(userId: string | null): Promise<AccessContext> {
  if (!userId) {
    return {
      userId: null,
      isAuthenticated: false,
      isPremium: false,
      planCode: 'anonymous',
      planName: 'Guest',
      subscriptionId: null,
      subscriptionStatus: null,
      subscriptionEndsAt: null,
      autoRenew: false,
      limits: await anonLimits(),
      features: new Set(),
    };
  }

  const [subscription, grants] = await Promise.all([
    getActiveSubscription(userId),
    getFeatureGrants(userId),
  ]);

  const features = new Set<string>();
  for (const [feature, quota] of grants) if (quota !== 0) features.add(feature);

  const isPaidPlan = Boolean(subscription && subscription.planCode !== 'free');
  const grantedPremium = features.has(FEATURES.premiumPrompts);
  const isPremium = isPaidPlan || grantedPremium;

  let limits: PlanLimits;
  if (isPaidPlan && subscription) {
    const planLimits = parseJson<Record<string, number>>(subscription.planLimits, {});
    const fallback = await premiumFallbackLimits();
    limits = {
      copiesPerDay: planLimits.copiesPerDay ?? fallback.copiesPerDay,
      favorites: planLimits.favorites ?? fallback.favorites,
      generatorPerDay: planLimits.generatorPerDay ?? fallback.generatorPerDay,
      ...planLimits,
    };
    for (const feature of PREMIUM_FEATURES) features.add(feature);
  } else if (grantedPremium) {
    limits = await premiumFallbackLimits();
  } else {
    limits = await freeLimits();
  }

  if (features.has(FEATURES.unlimitedCopies)) limits.copiesPerDay = -1;
  if (features.has(FEATURES.unlimitedFavorites)) limits.favorites = -1;

  return {
    userId,
    isAuthenticated: true,
    isPremium,
    planCode: subscription?.planCode ?? 'free',
    planName: subscription?.planName ?? 'Free',
    subscriptionId: subscription?.id ?? null,
    subscriptionStatus: subscription?.status ?? null,
    subscriptionEndsAt: subscription?.endDate ?? null,
    autoRenew: subscription?.autoRenew ?? false,
    limits,
    features,
  };
}

export function hasFeature(access: AccessContext, feature: FeatureKey): boolean {
  return access.features.has(feature);
}

export function assertFeature(access: AccessContext, feature: FeatureKey, message?: string): void {
  if (!hasFeature(access, feature)) {
    throw AppError.paymentRequired(message ?? 'Upgrade to Premium to use this feature');
  }
}

export function rateMultiplier(access: AccessContext): number {
  if (access.isPremium) return 4;
  if (access.isAuthenticated) return 2;
  return 1;
}

/* ------------------------------- Usage counters ---------------------------- */

export interface UsageStatus {
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
  allowed: boolean;
}

function toStatus(used: number, limit: number): UsageStatus {
  const unlimited = limit < 0;
  return {
    used,
    limit,
    remaining: unlimited ? Number.POSITIVE_INFINITY : Math.max(0, limit - used),
    unlimited,
    allowed: unlimited || used < limit,
  };
}

export async function copyUsage(access: AccessContext, visitorHash: string | null): Promise<UsageStatus> {
  const limit = access.limits.copiesPerDay;
  if (limit < 0) return toStatus(0, -1);
  const today = dayBucket();
  const where = access.userId
    ? and(eq(promptCopies.userId, access.userId), eq(promptCopies.dayBucket, today))
    : and(eq(promptCopies.visitorHash, visitorHash ?? '—'), eq(promptCopies.dayBucket, today));
  const rows = await db.select({ value: count() }).from(promptCopies).where(where);
  return toStatus(rows[0]?.value ?? 0, limit);
}

export async function generatorUsage(access: AccessContext, visitorHash: string | null): Promise<UsageStatus> {
  const limit = access.limits.generatorPerDay;
  if (limit < 0) return toStatus(0, -1);
  const today = dayBucket();
  const where = access.userId
    ? and(eq(generatedPrompts.userId, access.userId), eq(generatedPrompts.dayBucket, today))
    : and(eq(generatedPrompts.visitorHash, visitorHash ?? '—'), eq(generatedPrompts.dayBucket, today));
  const rows = await db.select({ value: count() }).from(generatedPrompts).where(where);
  return toStatus(rows[0]?.value ?? 0, limit);
}

export async function favoriteUsage(access: AccessContext): Promise<UsageStatus> {
  const limit = access.limits.favorites;
  if (limit < 0) return toStatus(0, -1);
  if (!access.userId) return toStatus(0, 0);
  const rows = await db.select({ value: count() }).from(favorites).where(eq(favorites.userId, access.userId));
  return toStatus(rows[0]?.value ?? 0, limit);
}

/* ------------------------------ Entitlement writes ------------------------- */

export async function activatePremium(input: {
  userId: string;
  subscriptionId: string;
  expiresAt: number | null;
}): Promise<void> {
  await db
    .update(entitlements)
    .set({ revokedAt: nowSec(), updatedAt: nowSec() })
    .where(eq(entitlements.userId, input.userId));

  const rows = PREMIUM_FEATURES.map((feature) => ({
    id: newId(),
    userId: input.userId,
    subscriptionId: input.subscriptionId,
    feature,
    quota: -1,
    source: 'plan' as const,
    startsAt: nowSec(),
    expiresAt: input.expiresAt,
  }));
  await db.insert(entitlements).values(rows);
  await db
    .update(users)
    .set({ premiumCachedUntil: input.expiresAt, updatedAt: nowSec() })
    .where(eq(users.id, input.userId));
}

export async function deactivatePremium(userId: string): Promise<void> {
  await db
    .update(entitlements)
    .set({ revokedAt: nowSec(), updatedAt: nowSec() })
    .where(eq(entitlements.userId, userId));
  await db
    .update(users)
    .set({ premiumCachedUntil: null, updatedAt: nowSec() })
    .where(eq(users.id, userId));
}

export { PREMIUM_FEATURES };
