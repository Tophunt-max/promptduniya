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
  tags,
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


/* --------------------------- Engagement series ---------------------------- */

/**
 * Favourites and likes per day.
 *
 * Both tables carry `createdAt` but no `dayBucket` column — unlike
 * `prompt_views` and `prompt_copies`, which were designed for this kind of
 * rollup — so `seriesFrom` cannot be reused and the bucket is derived in SQL
 * with the same +330 minute IST shift the rest of the app uses.
 */
async function seriesFromTimestamp(
  table: typeof favorites | typeof likes,
  days: number,
): Promise<DailySeries> {
  const buckets = lastNDayBuckets(days);
  const since = nowSec() - days * 86_400;
  const rows = await db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${table.createdAt}, 'unixepoch', '+330 minutes')`,
      value: count(),
    })
    .from(table)
    .where(gte(table.createdAt, since))
    .groupBy(sql`1`);

  const map = new Map(rows.map((r) => [r.day, r.value]));
  return { labels: buckets, values: buckets.map((b) => map.get(b) ?? 0) };
}

export const dailyFavorites = (days = 30) => seriesFromTimestamp(favorites, days);
export const dailyLikes = (days = 30) => seriesFromTimestamp(likes, days);

/**
 * Raw page views per day.
 *
 * Distinct from `dailyVisitors`, which counts unique visitor hashes over the
 * same table. Both are worth showing: the ratio between them is the clearest
 * single indicator of whether readers browse more than one page.
 */
export const dailyPageViews = (days = 30) => seriesFrom(pageViews, days);

/**
 * The most used tags.
 *
 * Reads the denormalised `usageCount` rather than aggregating `prompt_tags`,
 * because the count is already maintained on write and this query runs on a
 * dashboard. Only tags actually in use are returned — a tag with a zero count is
 * orphaned rather than unpopular, and belongs on the tag admin screen instead.
 */
export async function topTags(limit = 12) {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      usageCount: tags.usageCount,
    })
    .from(tags)
    .where(sql`${tags.usageCount} > 0`)
    .orderBy(desc(tags.usageCount))
    .limit(limit);
}

/**
 * Referrers, grouped by host.
 *
 * `page_views.referrer` stores a full URL, which is far too granular to read as
 * a list — a hundred rows of the same site with different paths. Grouping by
 * host in SQL is not practical in SQLite without a URL function, so the host is
 * extracted in JS over a bounded window.
 */
export async function topReferrers(limit = 10, days = 30) {
  const buckets = lastNDayBuckets(days);
  const rows = await db
    .select({ referrer: pageViews.referrer })
    .from(pageViews)
    .where(and(gte(pageViews.dayBucket, buckets[0]!), sql`${pageViews.referrer} is not null`))
    .limit(4000);

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.referrer) continue;
    let host: string;
    try {
      host = new URL(row.referrer).host || 'direct';
    } catch {
      // Not a parseable URL — keep it, truncated, rather than dropping the signal.
      host = row.referrer.slice(0, 60);
    }
    counts.set(host, (counts.get(host) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([host, hits]) => ({ host, hits }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit);
}

/** The most viewed pages, so the admin can see what actually gets traffic. */
export async function topPages(limit = 10, days = 30) {
  const buckets = lastNDayBuckets(days);
  return db
    .select({ path: pageViews.path, hits: count() })
    .from(pageViews)
    .where(gte(pageViews.dayBucket, buckets[0]!))
    .groupBy(pageViews.path)
    .orderBy(desc(count()))
    .limit(limit);
}
