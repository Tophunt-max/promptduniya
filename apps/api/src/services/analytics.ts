import {
  analyticsEvents,
  categories,
  db,
  favorites,
  generatedPrompts,
  likes,
  pageViews,
  payments,
  promptCopies,
  promptViews,
  prompts,
  searchQueries,
  subscriptions,
  users,
} from '@pd/db';
import { SETTING_KEYS } from '@pd/shared';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';

import { dayBucket, lastNDayBuckets, nowSec } from '../lib/dates';
import { newId } from '../lib/crypto';
import { getBoolSetting } from './settings';

/**
 * First-party analytics.
 *
 * Only pseudonymous aggregates are recorded: a keyed visitor hash, a path and a
 * day bucket. No raw IP addresses, no cross-site identifiers, and the whole
 * subsystem can be switched off from the admin settings panel.
 */

async function enabled(): Promise<boolean> {
  return getBoolSetting(SETTING_KEYS.analyticsEnabled, true);
}

export async function trackPageView(input: {
  path: string;
  userId?: string | null;
  visitorHash?: string | null;
  referrer?: string | null;
}): Promise<void> {
  if (!(await enabled())) return;
  await db.insert(pageViews).values({
    id: newId(),
    path: input.path.slice(0, 300),
    userId: input.userId ?? null,
    visitorHash: input.visitorHash ?? null,
    referrer: input.referrer?.slice(0, 300) ?? null,
    dayBucket: dayBucket(),
  });
}

export async function trackEvent(input: {
  name: string;
  userId?: string | null;
  visitorHash?: string | null;
  props?: Record<string, unknown>;
}): Promise<void> {
  if (!(await enabled())) return;
  await db.insert(analyticsEvents).values({
    id: newId(),
    name: input.name.slice(0, 60),
    userId: input.userId ?? null,
    visitorHash: input.visitorHash ?? null,
    propsJson: input.props ? JSON.stringify(input.props).slice(0, 2000) : null,
    dayBucket: dayBucket(),
  });
}

/* ------------------------------- Aggregates ------------------------------- */

export interface DailySeries {
  labels: string[];
  values: number[];
}

/** Counts rows per day bucket and fills gaps so the series is contiguous. */
async function seriesFrom(
  table: typeof pageViews | typeof promptViews | typeof promptCopies | typeof generatedPrompts,
  days: number,
): Promise<DailySeries> {
  const buckets = lastNDayBuckets(days);
  const rows = await db
    .select({ day: table.dayBucket, value: count() })
    .from(table)
    .where(gte(table.dayBucket, buckets[0]!))
    .groupBy(table.dayBucket);

  const map = new Map(rows.map((r) => [r.day, r.value]));
  return { labels: buckets, values: buckets.map((b) => map.get(b) ?? 0) };
}

export async function dailyVisitors(days = 30): Promise<DailySeries> {
  const buckets = lastNDayBuckets(days);
  const rows = await db
    .select({
      day: pageViews.dayBucket,
      value: sql<number>`count(distinct ${pageViews.visitorHash})`,
    })
    .from(pageViews)
    .where(gte(pageViews.dayBucket, buckets[0]!))
    .groupBy(pageViews.dayBucket);

  const map = new Map(rows.map((r) => [r.day, Number(r.value)]));
  return { labels: buckets, values: buckets.map((b) => map.get(b) ?? 0) };
}

export const dailyPromptViews = (days = 30) => seriesFrom(promptViews, days);
export const dailyPromptCopies = (days = 30) => seriesFrom(promptCopies, days);
export const dailyGeneratorUsage = (days = 30) => seriesFrom(generatedPrompts, days);

/** Day buckets are IST-aligned (+330 minutes) to match the rest of the app. */
export async function dailySignups(days = 30): Promise<DailySeries> {
  const buckets = lastNDayBuckets(days);
  const since = nowSec() - days * 86_400;
  const rows = await db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${users.createdAt}, 'unixepoch', '+330 minutes')`,
      value: count(),
    })
    .from(users)
    .where(gte(users.createdAt, since))
    .groupBy(sql`1`);

  const map = new Map(rows.map((r) => [r.day, r.value]));
  return { labels: buckets, values: buckets.map((b) => map.get(b) ?? 0) };
}

export async function dailyRevenue(days = 30): Promise<DailySeries> {
  const buckets = lastNDayBuckets(days);
  const since = nowSec() - days * 86_400;
  const rows = await db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${payments.createdAt}, 'unixepoch', '+330 minutes')`,
      value: sql<number>`coalesce(sum(${payments.amountMinor}), 0)`,
    })
    .from(payments)
    .where(and(eq(payments.status, 'captured'), gte(payments.createdAt, since)))
    .groupBy(sql`1`);

  const map = new Map(rows.map((r) => [r.day, Number(r.value)]));
  return { labels: buckets, values: buckets.map((b) => map.get(b) ?? 0) };
}

export async function dailyPremiumConversions(days = 30): Promise<DailySeries> {
  const buckets = lastNDayBuckets(days);
  const since = nowSec() - days * 86_400;
  const rows = await db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${subscriptions.createdAt}, 'unixepoch', '+330 minutes')`,
      value: count(),
    })
    .from(subscriptions)
    .where(and(eq(subscriptions.status, 'active'), gte(subscriptions.createdAt, since)))
    .groupBy(sql`1`);

  const map = new Map(rows.map((r) => [r.day, r.value]));
  return { labels: buckets, values: buckets.map((b) => map.get(b) ?? 0) };
}

export async function topPrompts(limit = 10) {
  return db
    .select({
      id: prompts.id,
      title: prompts.title,
      slug: prompts.slug,
      views: prompts.viewCount,
      copies: prompts.copyCount,
      likes: prompts.likeCount,
    })
    .from(prompts)
    .where(eq(prompts.isPublished, true))
    .orderBy(desc(prompts.viewCount))
    .limit(limit);
}

export async function topSearches(limit = 10, days = 30) {
  const buckets = lastNDayBuckets(days);
  return db
    .select({ term: searchQueries.normalized, hits: count() })
    .from(searchQueries)
    .where(gte(searchQueries.dayBucket, buckets[0]!))
    .groupBy(searchQueries.normalized)
    .orderBy(desc(count()))
    .limit(limit);
}

export async function popularSearchTerms(limit = 8): Promise<string[]> {
  const rows = await topSearches(limit, 90);
  return rows.map((r) => r.term);
}

export async function topCategories(limit = 8) {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      promptCount: categories.promptCount,
    })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(desc(categories.promptCount))
    .limit(limit);
}

export interface PlatformStats {
  totalUsers: number;
  newUsers7d: number;
  activeUsers30d: number;
  premiumUsers: number;
  mrrMinor: number;
  totalRevenueMinor: number;
  successfulPayments: number;
  failedPayments: number;
  totalPrompts: number;
  publishedPrompts: number;
  premiumPrompts: number;
  promptViews: number;
  promptCopies: number;
  totalLikes: number;
  totalFavorites: number;
  generatorRuns: number;
}

export async function platformStats(): Promise<PlatformStats> {
  const week = nowSec() - 7 * 86_400;
  const month = nowSec() - 30 * 86_400;

  const single = async (query: Promise<{ value: number }[]>) => Number((await query)[0]?.value ?? 0);

  const [
    totalUsers,
    newUsers7d,
    activeUsers30d,
    premiumUsers,
    totalRevenueMinor,
    successfulPayments,
    failedPayments,
    totalPrompts,
    publishedPrompts,
    premiumPromptsCount,
    promptViewsCount,
    promptCopiesCount,
    totalLikes,
    totalFavorites,
    generatorRuns,
    mrrRows,
  ] = await Promise.all([
    single(db.select({ value: count() }).from(users)),
    single(db.select({ value: count() }).from(users).where(gte(users.createdAt, week))),
    single(db.select({ value: count() }).from(users).where(gte(users.lastLoginAt, month))),
    single(
      db
        .select({ value: count() })
        .from(subscriptions)
        .where(and(eq(subscriptions.status, 'active'), sql`${subscriptions.planId} is not null`)),
    ),
    single(
      db
        .select({ value: sql<number>`coalesce(sum(${payments.amountMinor}), 0)` })
        .from(payments)
        .where(eq(payments.status, 'captured')),
    ),
    single(db.select({ value: count() }).from(payments).where(eq(payments.status, 'captured'))),
    single(db.select({ value: count() }).from(payments).where(eq(payments.status, 'failed'))),
    single(db.select({ value: count() }).from(prompts)),
    single(db.select({ value: count() }).from(prompts).where(eq(prompts.isPublished, true))),
    single(db.select({ value: count() }).from(prompts).where(eq(prompts.isPremium, true))),
    single(db.select({ value: sql<number>`coalesce(sum(${prompts.viewCount}), 0)` }).from(prompts)),
    single(db.select({ value: sql<number>`coalesce(sum(${prompts.copyCount}), 0)` }).from(prompts)),
    single(db.select({ value: count() }).from(likes)),
    single(db.select({ value: count() }).from(favorites)),
    single(db.select({ value: count() }).from(generatedPrompts)),
    db
      .select({ amount: sql<number>`coalesce(sum(${payments.amountMinor}), 0)` })
      .from(payments)
      .where(and(eq(payments.status, 'captured'), gte(payments.createdAt, month))),
  ]);

  return {
    totalUsers,
    newUsers7d,
    activeUsers30d,
    premiumUsers,
    mrrMinor: Number(mrrRows[0]?.amount ?? 0),
    totalRevenueMinor,
    successfulPayments,
    failedPayments,
    totalPrompts,
    publishedPrompts,
    premiumPrompts: premiumPromptsCount,
    promptViews: promptViewsCount,
    promptCopies: promptCopiesCount,
    totalLikes,
    totalFavorites,
    generatorRuns,
  };
}
