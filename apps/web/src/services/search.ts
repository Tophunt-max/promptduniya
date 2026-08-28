import { and, desc, eq, like, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import { categories, prompts, searchQueries, tags } from '@/db/schema';
import { AI_MODELS, STYLES } from '@/lib/constants';
import { lastNDayBuckets } from '@/lib/dates';
import { listPrompts, type PromptListResult } from './prompts';
import { trackSearch } from './analytics';

/**
 * Search.
 *
 * Matching runs against the denormalised `search_text` haystack (title +
 * description + prompt body + tags + category), which keeps queries on a single
 * indexed column instead of fanning out across joins.
 */

export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
}

export interface SearchOptions {
  query: string;
  page?: number;
  pageSize?: number;
  category?: string;
  model?: string;
  access?: string;
  sort?: string;
  style?: string;
  gender?: string;
  aspect?: string;
  viewerId?: string | null;
  visitorHash?: string | null;
  /** Analytics is skipped for suggestion lookups and internal calls. */
  track?: boolean;
}

export async function searchPrompts(options: SearchOptions): Promise<PromptListResult> {
  const normalized = normalizeQuery(options.query);

  const result = await listPrompts(
    {
      q: normalized,
      page: options.page ?? 1,
      pageSize: options.pageSize,
      category: options.category,
      model: options.model,
      access: (options.access as 'all' | 'free' | 'premium') ?? 'all',
      sort: (options.sort as never) ?? (normalized ? 'most-viewed' : 'trending'),
      style: options.style,
      gender: options.gender,
      aspect: options.aspect,
    },
    options.viewerId,
  );

  if (options.track !== false && normalized.length >= 2 && (options.page ?? 1) === 1) {
    await trackSearch({
      query: options.query,
      normalized,
      resultCount: result.total,
      userId: options.viewerId ?? null,
      visitorHash: options.visitorHash ?? null,
    });
  }

  return result;
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
      .select({ title: prompts.title, slug: prompts.slug, model: prompts.aiModel })
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
    out.push({
      type: 'category',
      label: row.name,
      href: `/category/${row.slug}`,
      hint: `${row.promptCount} prompts`,
    });
  }

  for (const model of AI_MODELS) {
    if (model.label.toLowerCase().includes(q) || model.id.includes(q)) {
      out.push({
        type: 'model',
        label: `${model.label} prompts`,
        href: `/explore?model=${model.id}`,
        hint: 'AI model',
      });
    }
  }

  for (const style of STYLES) {
    if (style.toLowerCase().includes(q)) {
      out.push({
        type: 'style',
        label: `${style} style`,
        href: `/explore?style=${encodeURIComponent(style)}`,
        hint: 'Style',
      });
    }
  }

  for (const row of tagRows) {
    out.push({ type: 'tag', label: `#${row.name}`, href: `/explore?tag=${row.slug}`, hint: 'Tag' });
  }

  for (const row of promptRows) {
    out.push({ type: 'prompt', label: row.title, href: `/prompt/${row.slug}`, hint: 'Prompt' });
  }

  return out.slice(0, limit + 4);
}

/** Most-searched terms across the last 90 days, for the search empty state. */
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

/** A user's recent searches (server-side history, used on /search). */
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

/** Fallback suggestions shown when a search returns nothing. */
export async function noResultAlternatives(query: string, limit = 6) {
  const words = normalizeQuery(query).split(' ').filter((w) => w.length > 2);
  if (words.length === 0) return [];

  const clauses = words.map((word) => like(prompts.searchText, `%${word}%`));
  const rows = await db
    .select({ title: prompts.title, slug: prompts.slug })
    .from(prompts)
    .where(and(eq(prompts.isPublished, true), or(...clauses)))
    .orderBy(desc(prompts.viewCount))
    .limit(limit);

  return rows;
}
