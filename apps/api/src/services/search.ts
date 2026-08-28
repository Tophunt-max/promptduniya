import { categories, db, prompts, searchQueries, tags } from '@pd/db';
import { AI_MODELS, STYLES } from '@pd/shared';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';

import { newId } from '../lib/crypto';
import { dayBucket, lastNDayBuckets } from '../lib/dates';
import { listPrompts, type ListQuery, type ListResult } from './prompts';

/** Search + suggestions over the denormalised `search_text` haystack. */

export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
}

export async function searchPrompts(options: ListQuery & { query: string }): Promise<ListResult> {
  return listPrompts({
    q: normalizeQuery(options.query),
    page: options.page,
    pageSize: options.pageSize,
    category: options.category,
    model: options.model,
    access: options.access,
    sort: options.sort ?? (options.query ? 'most-viewed' : 'trending'),
    style: options.style,
  });
}

export interface Suggestion {
  type: 'prompt' | 'category' | 'tag' | 'model' | 'style';
  label: string;
  href: string;
  hint?: string;
}

export async function suggest(rawQuery: string, limit = 8): Promise<Suggestion[]> {
  const q = normalizeQuery(rawQuery);
  if (q.length < 2) return [];
  const needle = `%${q}%`;
  const out: Suggestion[] = [];

  const [promptRows, categoryRows, tagRows] = await Promise.all([
    db
      .select({ title: prompts.title, slug: prompts.slug })
      .from(prompts)
      .where(and(eq(prompts.isPublished, true), like(sql`lower(${prompts.title})`, needle)))
      .orderBy(desc(prompts.viewCount))
      .limit(limit),
    db
      .select({ name: categories.name, slug: categories.slug, promptCount: categories.promptCount })
      .from(categories)
      .where(and(eq(categories.isActive, true), like(sql`lower(${categories.name})`, needle)))
      .limit(4),
    db
      .select({ name: tags.name, slug: tags.slug })
      .from(tags)
      .where(like(sql`lower(${tags.name})`, needle))
      .orderBy(desc(tags.usageCount))
      .limit(4),
  ]);

  for (const row of categoryRows) {
    out.push({ type: 'category', label: row.name, href: `/category/${row.slug}`, hint: `${row.promptCount} prompts` });
  }
  for (const model of AI_MODELS) {
    if (model.label.toLowerCase().includes(q) || model.id.includes(q)) {
      out.push({ type: 'model', label: `${model.label} prompts`, href: `/explore?model=${model.id}`, hint: 'AI model' });
    }
  }
  for (const style of STYLES) {
    if (style.toLowerCase().includes(q)) {
      out.push({ type: 'style', label: `${style} style`, href: `/explore?style=${encodeURIComponent(style)}`, hint: 'Style' });
    }
  }
  for (const row of tagRows) out.push({ type: 'tag', label: `#${row.name}`, href: `/explore?tag=${row.slug}`, hint: 'Tag' });
  for (const row of promptRows) out.push({ type: 'prompt', label: row.title, href: `/prompt/${row.slug}`, hint: 'Prompt' });

  return out.slice(0, limit + 4);
}


/* ========================= Discovery helpers ========================== */

/** Records a search so the popular/recent lists have data to draw on. */
export async function trackSearch(input: {
  query: string;
  normalized: string;
  resultCount: number;
  userId?: string | null;
  visitorHash?: string | null;
}): Promise<void> {
  if (!input.normalized) return;
  await db.insert(searchQueries).values({
    id: newId(),
    query: input.query.slice(0, 200),
    normalized: input.normalized.slice(0, 200),
    resultCount: input.resultCount,
    userId: input.userId ?? null,
    visitorHash: input.visitorHash ?? null,
    dayBucket: dayBucket(),
  });
}

export async function popularSearches(limit = 8): Promise<{ term: string; hits: number }[]> {
  const buckets = lastNDayBuckets(90);
  const rows = await db
    .select({ term: searchQueries.normalized, hits: sql<number>`count(*)` })
    .from(searchQueries)
    .where(sql`${searchQueries.dayBucket} >= ${buckets[0]!}`)
    .groupBy(searchQueries.normalized)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);

  return rows.map((r) => ({ term: r.term, hits: Number(r.hits) }));
}

/** De-duplicated recent searches for the signed-in user. */
export async function recentSearchesForUser(userId: string, limit = 6): Promise<string[]> {
  const rows = await db
    .select({ term: searchQueries.normalized })
    .from(searchQueries)
    .where(eq(searchQueries.userId, userId))
    .orderBy(desc(searchQueries.createdAt))
    .limit(limit * 3);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    if (seen.has(row.term)) continue;
    seen.add(row.term);
    out.push(row.term);
    if (out.length >= limit) break;
  }
  return out;
}

/** Loose word-match fallbacks shown when a search returns nothing. */
export async function noResultAlternatives(
  query: string,
  limit = 6,
): Promise<{ title: string; slug: string }[]> {
  const words = normalizeQuery(query)
    .split(' ')
    .filter((w) => w.length > 2);
  if (words.length === 0) return [];

  const clauses = words.map((word) => like(prompts.searchText, `%${word}%`));
  return db
    .select({ title: prompts.title, slug: prompts.slug })
    .from(prompts)
    .where(and(eq(prompts.isPublished, true), or(...clauses)))
    .orderBy(desc(prompts.viewCount))
    .limit(limit);
}
