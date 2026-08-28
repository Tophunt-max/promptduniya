import { and, count, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  entitlements,
  favorites,
  generatedPrompts,
  plans,
  promptCopies,
  subscriptions,
  users,
} from '@/db/schema';
import { AppError } from '@/lib/api';
import { FEATURES, SETTING_KEYS, type FeatureKey } from '@/lib/constants';
import { dayBucket, nowSec } from '@/lib/dates';
import { parseJson } from '@/lib/utils';
import { getNumberSetting } from './settings';

/**
 * Entitlement resolution.
 *
 * Premium access is NEVER derived from a client-supplied flag or from a bare
 * `user.isPremium` boolean. Every check walks:
 *   authenticate → load subscription → validate status + dates → check quota.
 * `users.premium_cached_until` exists purely as a denormalised hint for
 * rendering badges and is re-validated here before anything is granted.
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

const ACTIVE_STATUSES = ['active', 'past_due'] as const;

/** The subscription row that currently grants access, if any. */
export async function getActiveSubscription(userId: string) {
  const rows = await db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      startDate: subscriptions.startDate,
      endDate: subscriptions.endDate,
      autoRenew: subscriptions.autoRenew,
      planId: plans.id,
      planCode: plans.code,
      planName: plans.name,
      planLimits: plans.limitsJson,
      planFeatures: plans.featuresJson,
      billingPeriod: plans.billingPeriod,
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
 * Explicit per-feature grants (manual admin grants, promos, plan expansion).
 *
 * A grant that came from a plan is only honoured while its subscription is
 * genuinely active and in-window. Without that join, editing or cancelling a
 * subscription would leave orphaned grants that still unlocked premium content
 * until a sweep job happened to run.
 */
async function getFeatureGrants(userId: string): Promise<Map<string, number>> {
  const now = nowSec();

  const rows = await db
    .select({
      feature: entitlements.feature,
      quota: entitlements.quota,
      subscriptionId: entitlements.subscriptionId,
      subscriptionStatus: subscriptions.status,
      subscriptionEnd: subscriptions.endDate,
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
        row.subscriptionStatus !== null &&
        (ACTIVE_STATUSES as readonly string[]).includes(row.subscriptionStatus);
      const windowOk = row.subscriptionEnd === null || row.subscriptionEnd > now;
      if (!statusOk || !windowOk) continue;
    }
    map.set(row.feature, row.quota);
  }

  return map;
}

async function freeLimits(): Promise<PlanLimits> {
  return {
    copiesPerDay: await getNumberSetting(SETTING_KEYS.freeCopiesPerDay, 10),
    favorites: await getNumberSetting(SETTING_KEYS.freeFavorites, 25),
    generatorPerDay: await getNumberSetting(SETTING_KEYS.freeGeneratorPerDay, 10),
  };
}

async function anonLimits(): Promise<PlanLimits> {
  return {
    copiesPerDay: await getNumberSetting(SETTING_KEYS.anonCopiesPerDay, 3),
    favorites: 0,
    generatorPerDay: await getNumberSetting(SETTING_KEYS.anonGeneratorPerDay, 3),
  };
}

async function premiumFallbackLimits(): Promise<PlanLimits> {
  return {
    copiesPerDay: await getNumberSetting(SETTING_KEYS.premiumCopiesPerDay, -1),
    favorites: await getNumberSetting(SETTING_KEYS.premiumFavorites, -1),
    generatorPerDay: await getNumberSetting(SETTING_KEYS.premiumGeneratorPerDay, -1),
  };
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

/**
 * Resolves the full access context for a user (or an anonymous visitor when
 * `userId` is null). This is the only function the rest of the app should use
 * when deciding what somebody is allowed to do.
 */
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
      features: new Set<string>(),
    };
  }

  const [subscription, grants] = await Promise.all([
    getActiveSubscription(userId),
    getFeatureGrants(userId),
  ]);

  const features = new Set<string>();
  for (const [feature, quota] of grants) if (quota !== 0) features.add(feature);

  // A paid plan is anything that is not the zero-priced `free` plan.
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

  // Explicit unlimited grants override numeric plan limits.
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

/** Throws 402 unless the caller genuinely holds the feature. */
export function assertFeature(access: AccessContext, feature: FeatureKey, message?: string): void {
  if (!hasFeature(access, feature)) {
    throw AppError.paymentRequired(message ?? 'Upgrade to Premium to use this feature');
  }
}

/* --------------------------- Daily usage counters -------------------------- */

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

export async function copyUsage(
  access: AccessContext,
  visitorHash: string | null,
): Promise<UsageStatus> {
  const limit = access.limits.copiesPerDay;
  if (limit < 0) return toStatus(0, -1);

  const today = dayBucket();
  const where = access.userId
    ? and(eq(promptCopies.userId, access.userId), eq(promptCopies.dayBucket, today))
    : and(eq(promptCopies.visitorHash, visitorHash ?? '—'), eq(promptCopies.dayBucket, today));

  const rows = await db.select({ value: count() }).from(promptCopies).where(where);
  return toStatus(rows[0]?.value ?? 0, limit);
}

export async function generatorUsage(
  access: AccessContext,
  visitorHash: string | null,
): Promise<UsageStatus> {
  const limit = access.limits.generatorPerDay;
  if (limit < 0) return toStatus(0, -1);

  const today = dayBucket();
  const where = access.userId
    ? and(eq(generatedPrompts.userId, access.userId), eq(generatedPrompts.dayBucket, today))
    : and(
        eq(generatedPrompts.visitorHash, visitorHash ?? '—'),
        eq(generatedPrompts.dayBucket, today),
      );

  const rows = await db.select({ value: count() }).from(generatedPrompts).where(where);
  return toStatus(rows[0]?.value ?? 0, limit);
}

export async function favoriteUsage(access: AccessContext): Promise<UsageStatus> {
  const limit = access.limits.favorites;
  if (limit < 0) return toStatus(0, -1);
  if (!access.userId) return toStatus(0, 0);

  const rows = await db
    .select({ value: count() })
    .from(favorites)
    .where(eq(favorites.userId, access.userId));
  return toStatus(rows[0]?.value ?? 0, limit);
}

/** Rate-limit multiplier so premium members are throttled more generously. */
export function rateMultiplier(access: AccessContext): number {
  if (access.isPremium) return 4;
  if (access.isAuthenticated) return 2;
  return 1;
}

/* --------------------------- Entitlement writes ---------------------------- */

export async function grantEntitlements(input: {
  userId: string;
  subscriptionId: string | null;
  features: readonly string[];
  expiresAt: number | null;
  source?: 'plan' | 'grant' | 'promo';
}): Promise<void> {
  const { newId } = await import('@/lib/id');
  const rows = input.features.map((feature) => ({
    id: newId(),
    userId: input.userId,
    subscriptionId: input.subscriptionId,
    feature,
    quota: -1,
    source: input.source ?? 'plan',
    startsAt: nowSec(),
    expiresAt: input.expiresAt,
  }));
  if (rows.length === 0) return;
  await db.insert(entitlements).values(rows);
}

export async function revokeEntitlements(userId: string, subscriptionId?: string): Promise<void> {
  await db
    .update(entitlements)
    .set({ revokedAt: nowSec(), updatedAt: nowSec() })
    .where(
      subscriptionId
        ? and(eq(entitlements.userId, userId), eq(entitlements.subscriptionId, subscriptionId))
        : eq(entitlements.userId, userId),
    );
}

/** Grants the standard premium feature bundle for a subscription window. */
export async function activatePremium(input: {
  userId: string;
  subscriptionId: string;
  expiresAt: number | null;
}): Promise<void> {
  await revokeEntitlements(input.userId);
  await grantEntitlements({
    userId: input.userId,
    subscriptionId: input.subscriptionId,
    features: PREMIUM_FEATURES,
    expiresAt: input.expiresAt,
  });
  await db
    .update(users)
    .set({ premiumCachedUntil: input.expiresAt, updatedAt: nowSec() })
    .where(eq(users.id, input.userId));
}

export async function deactivatePremium(userId: string): Promise<void> {
  await revokeEntitlements(userId);
  await db
    .update(users)
    .set({ premiumCachedUntil: null, updatedAt: nowSec() })
    .where(eq(users.id, userId));
}

export { PREMIUM_FEATURES };
