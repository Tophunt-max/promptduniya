import {
  db,
  generatedPrompts,
  pageViews,
  payments,
  promptCopies,
  prompts,
  searchQueries,
  subscriptions,
  users,
} from '@pd/db';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';

import { dayBucket, lastNDayBuckets, nowSec } from '../lib/dates';

/**
 * Read-only analytics for the admin dashboard. All aggregates run in D1 with
 * grouped counts — no per-row scans leave the database.
 */

export interface PlatformStats {
  totalUsers: number;
  totalPrompts: number;
  publishedPrompts: number;
  premiumPrompts: number;
  activeSubscriptions: number;
  totalCopies: number;
  totalGenerations: number;
  revenueMinor: number;
  newUsers30d: number;
}

export async function platformStats(): Promise<PlatformStats> {
  const since30 = nowSec() - 30 * 86_400;
  const [
    totalUsers,
    totalPrompts,
    publishedPrompts,
    premiumPrompts,
    activeSubs,
    copies,
    generations,
    revenue,
    newUsers,
  ] = await Promise.all([
    db.select({ v: count() }).from(users),
    db.select({ v: count() }).from(prompts),
    db.select({ v: count() }).from(prompts).where(eq(prompts.isPublished, true)),
    db.select({ v: count() }).from(prompts).where(eq(prompts.isPremium, true)),
    db.select({ v: count() }).from(subscriptions).where(eq(subscriptions.status, 'active')),
    db.select({ v: count() }).from(promptCopies),
    db.select({ v: count() }).from(generatedPrompts),
    db
      .select({ v: sql<number>`coalesce(sum(${payments.amountMinor} - ${payments.refundedMinor}), 0)` })
      .from(payments)
      .where(eq(payments.status, 'captured')),
    db.select({ v: count() }).from(users).where(gte(users.createdAt, since30)),
  ]);

  return {
    totalUsers: totalUsers[0]?.v ?? 0,
    totalPrompts: totalPrompts[0]?.v ?? 0,
    publishedPrompts: publishedPrompts[0]?.v ?? 0,
    premiumPrompts: premiumPrompts[0]?.v ?? 0,
    activeSubscriptions: activeSubs[0]?.v ?? 0,
    totalCopies: copies[0]?.v ?? 0,
    totalGenerations: generations[0]?.v ?? 0,
    revenueMinor: revenue[0]?.v ?? 0,
    newUsers30d: newUsers[0]?.v ?? 0,
  };
}

export interface DailyPoint {
  day: string;
  value: number;
}

/** Fills a grouped-count query onto a contiguous run of the last `days` days. */
function fillSeries(days: number, rows: { day: string; value: number }[]): DailyPoint[] {
  const buckets = lastNDayBuckets(days);
  const byDay = new Map(rows.map((r) => [r.day, r.value]));
  return buckets.map((day) => ({ day, value: byDay.get(day) ?? 0 }));
}

export async function pageViewSeries(days = 30): Promise<DailyPoint[]> {
  const since = dayBucket(nowSec() - (days - 1) * 86_400);
  const rows = await db
    .select({ day: pageViews.dayBucket, value: count() })
    .from(pageViews)
    .where(gte(pageViews.dayBucket, since))
    .groupBy(pageViews.dayBucket);
  return fillSeries(days, rows);
}

export async function signupSeries(days = 30): Promise<DailyPoint[]> {
  const since = nowSec() - (days - 1) * 86_400;
  const rows = await db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${users.createdAt}, 'unixepoch', '+330 minutes')`,
      value: count(),
    })
    .from(users)
    .where(gte(users.createdAt, since))
    .groupBy(sql`1`);
  return fillSeries(days, rows);
}

export async function revenueSeries(days = 30): Promise<DailyPoint[]> {
  const since = nowSec() - (days - 1) * 86_400;
  const rows = await db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${payments.createdAt}, 'unixepoch', '+330 minutes')`,
      value: sql<number>`coalesce(sum(${payments.amountMinor} - ${payments.refundedMinor}), 0)`,
    })
    .from(payments)
    .where(and(eq(payments.status, 'captured'), gte(payments.createdAt, since)))
    .groupBy(sql`1`);
  return fillSeries(days, rows);
}

export async function topSearchQueries(limit = 20): Promise<{ query: string; hits: number }[]> {
  const rows = await db
    .select({ query: searchQueries.normalized, hits: count() })
    .from(searchQueries)
    .groupBy(searchQueries.normalized)
    .orderBy(desc(count()))
    .limit(limit);
  return rows.map((r) => ({ query: r.query, hits: r.hits }));
}
