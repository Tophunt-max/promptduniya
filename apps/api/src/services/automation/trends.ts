import { categories, db, prompts, searchQueries, trendSignals } from '@pd/db';
import type { TrendSource, TrendStatus } from '@pd/shared';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { newId } from '../../lib/crypto';
import { batchByParams } from '../../lib/d1';
import { dayBucket, lastNDayBuckets, nowSec } from '../../lib/dates';
import { resolveTextEngine } from '../studio/text';
import { logAutomation, logError } from './logs';

/**
 * Trend discovery — deciding what to write about next.
 *
 * The existing `recomputeTrending()` in services/prompts.ts answers a different
 * question: given the catalogue, which of its posts are popular right now. That
 * is a re-ranking of things that already exist. This module has to produce topics
 * for posts that do *not* exist yet, which is the input the automated pipeline
 * needs and the one thing it had no source for.
 *
 * Four signals, mined in ascending order of cost:
 *
 *   search      What readers typed and the catalogue could not answer well.
 *               The strongest signal available, because it is literal demand
 *               rather than an inference — someone asked for this and we did not
 *               have it. Weighted by hits, and by how few results came back.
 *   engagement  Categories whose prompts get copied far more than they get
 *               viewed. A high copy-to-view ratio means readers who find that
 *               kind of prompt take it, so more of that kind is worth having.
 *   calendar    Indian festivals and seasons in the coming weeks. Predictable,
 *               free, and the highest-value window in this catalogue's domain:
 *               Diwali portrait demand is entirely foreseeable and entirely
 *               missed by any purely reactive signal.
 *   ai          A language model asked to expand the above into concrete,
 *               specific themes. Last because it is the only one that costs a
 *               provider call and the only one that can fail.
 *
 * There is no external trend API. Adding one would mean another key, another
 * quota and another failure mode for a signal that is weaker in this domain than
 * the site's own search log. `AI_SEARCH_PROVIDER` is the natural extension point
 * if that changes, and the `source` column already accommodates it.
 */

/* ---------------------------- Festival calendar --------------------------- */

/**
 * A rolling seasonal calendar.
 *
 * Dates are approximate because most of these follow the lunar calendar and
 * shift by a couple of weeks each year. That is fine: the window only decides
 * *when* to start suggesting a topic, and being early is harmless while being
 * late is the whole failure being avoided. Hardcoding an approximate month beats
 * pulling a Hindu calendar dependency into a Worker for a hint.
 *
 * `lead` is how many days before the window a topic becomes worth writing —
 * readers look for Diwali prompts well before Diwali.
 */
interface SeasonalEntry {
  label: string;
  /** 1-12. */
  month: number;
  /** Approximate day within the month. */
  day: number;
  leadDays: number;
  categoryHints: string[];
}

const SEASONAL_CALENDAR: SeasonalEntry[] = [
  { label: 'Makar Sankranti and Pongal harvest portraits', month: 1, day: 14, leadDays: 18, categoryHints: ['festival', 'traditional'] },
  { label: 'Republic Day patriotic portrait styling', month: 1, day: 26, leadDays: 12, categoryHints: ['festival', 'trending'] },
  { label: 'Valentine couple portrait sets', month: 2, day: 14, leadDays: 21, categoryHints: ['couple', 'trending'] },
  { label: 'Maha Shivratri temple portraits', month: 2, day: 26, leadDays: 14, categoryHints: ['festival', 'traditional'] },
  { label: 'Holi colour-drenched portraits', month: 3, day: 14, leadDays: 24, categoryHints: ['festival', 'trending'] },
  { label: 'Ugadi and Gudi Padwa new-year portraits', month: 3, day: 30, leadDays: 14, categoryHints: ['festival', 'traditional'] },
  { label: 'Baisakhi harvest festival portraits', month: 4, day: 13, leadDays: 14, categoryHints: ['festival', 'traditional'] },
  { label: 'Summer wedding season pre-wedding shoots', month: 4, day: 20, leadDays: 30, categoryHints: ['pre-wedding', 'wedding'] },
  { label: 'Monsoon rain-soaked editorial portraits', month: 6, day: 15, leadDays: 21, categoryHints: ['cinematic', 'fashion'] },
  { label: 'Teej and Hariyali traditional green sarees', month: 7, day: 27, leadDays: 18, categoryHints: ['saree', 'festival'] },
  { label: 'Raksha Bandhan sibling portraits', month: 8, day: 9, leadDays: 18, categoryHints: ['festival', 'traditional'] },
  { label: 'Independence Day tricolour portrait styling', month: 8, day: 15, leadDays: 12, categoryHints: ['festival', 'trending'] },
  { label: 'Janmashtami devotional portraits', month: 8, day: 16, leadDays: 14, categoryHints: ['festival', 'traditional'] },
  { label: 'Ganesh Chaturthi pandal portraits', month: 8, day: 27, leadDays: 20, categoryHints: ['festival', 'traditional'] },
  { label: 'Onam Kerala traditional portraits', month: 9, day: 5, leadDays: 16, categoryHints: ['festival', 'traditional'] },
  { label: 'Navratri garba and dandiya night portraits', month: 9, day: 22, leadDays: 24, categoryHints: ['festival', 'lehenga'] },
  { label: 'Durga Puja pandal-hopping portraits', month: 9, day: 28, leadDays: 22, categoryHints: ['festival', 'saree'] },
  { label: 'Karwa Chauth moonlight couple portraits', month: 10, day: 10, leadDays: 18, categoryHints: ['couple', 'traditional'] },
  { label: 'Diwali diya-lit portrait sets', month: 10, day: 20, leadDays: 28, categoryHints: ['festival', 'traditional'] },
  { label: 'Chhath Puja ghat portraits at sunrise', month: 11, day: 5, leadDays: 16, categoryHints: ['festival', 'traditional'] },
  { label: 'Winter wedding season sangeet and reception looks', month: 11, day: 20, leadDays: 30, categoryHints: ['wedding', 'lehenga'] },
  { label: 'Christmas and New Year party portraits', month: 12, day: 25, leadDays: 24, categoryHints: ['trending', 'fashion'] },
];

/**
 * Seasonal entries whose lead window is open right now.
 *
 * Wraps across the year end, so on 20 December the January entries are already
 * in scope. Handled by comparing against both this year's and next year's
 * occurrence rather than by arithmetic on day-of-year, which gets fiddly around
 * leap years for no benefit.
 */
function activeSeasonalEntries(at: number): { entry: SeasonalEntry; daysAway: number }[] {
  const now = new Date(at * 1000);
  const year = now.getUTCFullYear();
  const out: { entry: SeasonalEntry; daysAway: number }[] = [];

  for (const entry of SEASONAL_CALENDAR) {
    for (const candidateYear of [year, year + 1]) {
      const occurrence = Date.UTC(candidateYear, entry.month - 1, entry.day) / 1000;
      const daysAway = Math.round((occurrence - at) / 86_400);
      // Include a short tail after the date: interest does not stop the morning
      // after a festival, and a post published on the day still earns traffic.
      if (daysAway <= entry.leadDays && daysAway >= -4) {
        out.push({ entry, daysAway });
        break;
      }
    }
  }

  return out.sort((a, b) => a.daysAway - b.daysAway);
}

/* ------------------------------ Normalisation ----------------------------- */

/** The de-dupe key. Must match what the unique index stores. */
export function normaliseLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
    .slice(0, 180);
}

/* -------------------------------- Persisting ------------------------------ */

export interface SignalDraft {
  label: string;
  source: TrendSource;
  score: number;
  rationale?: string;
  categoryId?: string | null;
}

/**
 * Inserts signals, ignoring any whose normalised label already exists.
 *
 * `onConflictDoNothing` rather than an upsert on purpose. A signal that has
 * already been used must stay used — overwriting its row would reset `status` and
 * the scanner would cheerfully re-suggest a topic the catalogue already covers,
 * which is the exact loop this table exists to break.
 */
export async function recordSignals(drafts: SignalDraft[]): Promise<number> {
  if (drafts.length === 0) return 0;

  const seen = new Set<string>();
  const rows = [];

  for (const draft of drafts) {
    const normalized = normaliseLabel(draft.label);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    rows.push({
      id: newId(),
      label: draft.label.slice(0, 200),
      normalized,
      source: draft.source,
      score: draft.score,
      rationale: draft.rationale?.slice(0, 400) ?? null,
      categoryId: draft.categoryId ?? null,
      status: 'new' as const,
      dayBucket: dayBucket(),
    });
  }

  if (rows.length === 0) return 0;

  let inserted = 0;
  // Batched because D1 caps bound parameters per statement and a scan can
  // produce a few dozen signals at once. The batch size is derived from the row
  // width rather than fixed: at 9 columns a hardcoded 20 bound 180 parameters,
  // over D1's ceiling of 100, so every full pass failed here and only the last
  // short batch survived.
  for (const chunk of batchByParams(rows)) {
    try {
      await db.insert(trendSignals).values(chunk).onConflictDoNothing();
      inserted += chunk.length;
    } catch (error) {
      await logError('trend', 'Could not store a chunk of trend signals', {
        meta: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  return inserted;
}

/* ------------------------------ Signal mining ----------------------------- */

/** Maps a category hint to a real category id, so signals arrive pre-routed. */
async function categoryLookup(): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: categories.id, slug: categories.slug, name: categories.name })
    .from(categories)
    .where(eq(categories.isActive, true));

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.slug.toLowerCase(), row.id);
    map.set(row.name.toLowerCase(), row.id);
  }
  return map;
}

function resolveHint(hints: string[], lookup: Map<string, string>): string | null {
  for (const hint of hints) {
    const hit = lookup.get(hint.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

/**
 * Searches that returned little or nothing.
 *
 * The `resultCount` average is the important part. A term searched 200 times
 * that always returns 40 results is a well-served topic and no signal at all; a
 * term searched 12 times that returns two results is a gap in the catalogue.
 */
async function mineSearchSignals(lookup: Map<string, string>): Promise<SignalDraft[]> {
  const buckets = lastNDayBuckets(45);
  const since = buckets[0];
  if (!since) return [];

  const rows = await db
    .select({
      term: searchQueries.normalized,
      hits: sql<number>`count(*)`,
      avgResults: sql<number>`avg(${searchQueries.resultCount})`,
    })
    .from(searchQueries)
    .where(sql`${searchQueries.dayBucket} >= ${since}`)
    .groupBy(searchQueries.normalized)
    .having(sql`count(*) >= 3`)
    .orderBy(desc(sql`count(*)`))
    .limit(40);

  return rows
    .filter((row) => row.term.trim().length >= 4)
    .map((row) => {
      const hits = Number(row.hits);
      const avgResults = Number(row.avgResults ?? 0);
      // Scarcity multiplier: 1.0 when nothing was found, tapering to 0.2 once
      // the catalogue already answers the query well.
      const scarcity = avgResults <= 1 ? 1 : avgResults >= 20 ? 0.2 : 1 - avgResults / 25;
      return {
        label: row.term,
        source: 'search' as TrendSource,
        score: Math.round(hits * 4 * scarcity * 10) / 10,
        rationale: `Searched ${hits} time(s) in the last 45 days, averaging ${avgResults.toFixed(1)} results.`,
        categoryId: resolveHint(row.term.split(/\s+/), lookup),
      };
    })
    .filter((draft) => draft.score >= 4);
}

/**
 * Categories readers copy from disproportionately often.
 *
 * Copies are the conversion event on this site — a reader who copies a prompt got
 * what they came for. A category with a high copy-to-view ratio is one where the
 * catalogue is hitting the mark, so more of it is a good bet.
 */
async function mineEngagementSignals(): Promise<SignalDraft[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      views: sql<number>`sum(${prompts.viewCount})`,
      copies: sql<number>`sum(${prompts.copyCount})`,
      total: sql<number>`count(${prompts.id})`,
    })
    .from(categories)
    .innerJoin(prompts, eq(prompts.categoryId, categories.id))
    .where(eq(prompts.isPublished, true))
    .groupBy(categories.id)
    .having(sql`sum(${prompts.viewCount}) >= 40`)
    .limit(30);

  return rows
    .map((row) => {
      const views = Number(row.views ?? 0);
      const copies = Number(row.copies ?? 0);
      const ratio = views > 0 ? copies / views : 0;
      return {
        label: `More ${row.name} prompts`,
        source: 'engagement' as TrendSource,
        score: Math.round(ratio * 300 * 10) / 10,
        rationale: `${copies} copies from ${views} views (${(ratio * 100).toFixed(1)}%) across ${Number(row.total)} prompts.`,
        categoryId: row.id,
      };
    })
    .filter((draft) => draft.score >= 12)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function mineCalendarSignals(lookup: Map<string, string>, at: number): SignalDraft[] {
  return activeSeasonalEntries(at).map(({ entry, daysAway }) => ({
    label: entry.label,
    source: 'calendar' as TrendSource,
    // Closer means more urgent, but nothing outranks a live search gap.
    score: Math.round(Math.max(20, 90 - Math.abs(daysAway) * 1.5) * 10) / 10,
    rationale:
      daysAway >= 0
        ? `Approximately ${daysAway} day(s) away.`
        : `Happened about ${Math.abs(daysAway)} day(s) ago; interest is still live.`,
    categoryId: resolveHint(entry.categoryHints, lookup),
  }));
}

/** Categories with very little published content — a structural gap. */
async function mineThinCategorySignals(): Promise<SignalDraft[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      promptCount: categories.promptCount,
    })
    .from(categories)
    .where(and(eq(categories.isActive, true), sql`${categories.promptCount} < 6`))
    .orderBy(sql`${categories.promptCount} asc`)
    .limit(10);

  return rows.map((row) => ({
    label: `${row.name} collection starter set`,
    source: 'category' as TrendSource,
    score: Math.round((30 - row.promptCount * 3) * 10) / 10,
    rationale: `Only ${row.promptCount} published prompt(s) in this category.`,
    categoryId: row.id,
  }));
}

/* --------------------------------- AI step -------------------------------- */

const TREND_SYSTEM = `You are a content strategist for an Indian AI image prompt catalogue.

Your job is to propose specific, concrete photo-shoot themes that Indian creators would search for and use. Every subject is a clearly adult Indian person.

Rules:
- Each theme must be specific enough to shoot: name an occasion, a setting, and a look. "Wedding prompts" is useless. "Sangeet night lehenga portraits under fairy lights" is usable.
- Never name a real person, a celebrity, or a trademarked brand.
- No children, no teenagers, nothing sexual.
- Vary the subject, the setting and the light across your list. Do not return ten versions of the same idea.
- Between 6 and 14 words per theme.

Respond with a single JSON object: { "themes": ["theme one", "theme two"] }
No markdown fence, no commentary.`;

function trendUserMessage(seeds: string[], count: number, categoryNames: string[]): string {
  const seedBlock = seeds.length
    ? `These signals came from the site's own search log, engagement data and seasonal calendar. Use them as direction:\n${seeds
        .slice(0, 18)
        .map((seed) => `- ${seed}`)
        .join('\n')}`
    : 'No signals available. Propose evergreen themes that Indian creators consistently search for.';

  return `${seedBlock}

Available categories: ${categoryNames.slice(0, 30).join(', ')}

Propose exactly ${count} distinct themes.`;
}

/** Pulls a string array out of a reply that may be fenced or chatty. */
function parseThemes(raw: unknown): string[] {
  const asObject = (value: unknown): Record<string, unknown> | null => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value !== 'string') return null;

    const cleaned = value
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();

    try {
      return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start === -1 || end <= start) return null;
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  };

  const parsed = asObject(raw);
  const list = parsed?.themes ?? parsed?.ideas ?? parsed?.topics;
  if (!Array.isArray(list)) return [];

  return list
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length >= 8 && item.length <= 200)
    .slice(0, 40);
}

/**
 * Expands mined signals into concrete, shootable themes with a language model.
 *
 * Returns an empty array rather than throwing when the provider is unavailable.
 * The mined signals are already usable on their own, so a quota exhaustion here
 * should degrade the quality of discovery rather than stop it.
 */
export async function expandWithAi(
  seeds: string[],
  count: number,
  lookup: Map<string, string>,
): Promise<SignalDraft[]> {
  if (count <= 0) return [];

  const started = Date.now();
  let engineName = 'unknown';

  try {
    const engine = await resolveTextEngine();
    engineName = engine.name;

    const categoryNames = [...new Set([...lookup.keys()])].filter((key) => !key.includes('-'));

    const reply = await engine.complete({
      system: TREND_SYSTEM,
      user: trendUserMessage(seeds, count, categoryNames),
      maxTokens: 1200,
    });

    const themes = parseThemes(reply);

    // A reply that yields nothing usable is a failure, not a quiet success. It
    // reads as "the model is configured and working, there was just nothing to
    // say", which is almost never true — the usual cause is a model id that
    // answers but does not honour the JSON contract. Logged at `warn` so it
    // surfaces on the Logs tab instead of scrolling past as routine info.
    await logAutomation({
      scope: 'trend',
      level: themes.length === 0 ? 'warn' : 'info',
      message:
        themes.length === 0
          ? `Expanded ${seeds.length} signal(s) into no usable AI themes — the reply did not parse. Check the text model on the AI providers screen.`
          : `Expanded ${seeds.length} signal(s) into ${themes.length} AI theme(s)`,
      provider: engineName,
      durationMs: Date.now() - started,
    });

    return themes.map((label) => ({
      label,
      source: 'ai' as TrendSource,
      // Below a live search gap, above a structural category gap: a plausible
      // suggestion, but not evidence of demand.
      score: 40,
      rationale: `Proposed by ${engineName} from ${seeds.length} internal signal(s).`,
      categoryId: resolveHint(label.split(/\s+/), lookup),
    }));
  } catch (error) {
    await logError('trend', 'AI trend expansion failed; using mined signals only', {
      provider: engineName,
      durationMs: Date.now() - started,
      meta: { error: error instanceof Error ? error.message : String(error) },
    });
    return [];
  }
}

/* ------------------------------ Orchestration ----------------------------- */

export interface DiscoverResult {
  discovered: number;
  stored: number;
  bySource: Record<string, number>;
  aiUsed: boolean;
}

/**
 * A full discovery pass. Safe to run repeatedly — the unique index absorbs
 * anything already known.
 */
export async function discoverTrends(
  options: { aiCount?: number; internalOnly?: boolean } = {},
): Promise<DiscoverResult> {
  const at = nowSec();
  const lookup = await categoryLookup();

  const [search, engagement, thin] = await Promise.all([
    mineSearchSignals(lookup).catch(() => [] as SignalDraft[]),
    mineEngagementSignals().catch(() => [] as SignalDraft[]),
    mineThinCategorySignals().catch(() => [] as SignalDraft[]),
  ]);
  const calendar = mineCalendarSignals(lookup, at);

  const mined = [...search, ...calendar, ...engagement, ...thin];

  // Seed the model with the strongest signals only. Feeding it the whole list
  // dilutes the direction and mostly produces variations on the weakest entries.
  const seeds = [...mined]
    .sort((a, b) => b.score - a.score)
    .slice(0, 18)
    .map((draft) => `${draft.label} (${draft.rationale ?? draft.source})`);

  const ai = options.internalOnly
    ? []
    : await expandWithAi(seeds, options.aiCount ?? 12, lookup);

  const all = [...mined, ...ai];
  const stored = await recordSignals(all);

  const bySource: Record<string, number> = {};
  for (const draft of all) bySource[draft.source] = (bySource[draft.source] ?? 0) + 1;

  await logAutomation({
    scope: 'trend',
    message: `Discovery pass found ${all.length} signal(s), stored ${stored} new`,
    meta: { bySource, aiUsed: ai.length > 0 },
  });

  return { discovered: all.length, stored, bySource, aiUsed: ai.length > 0 };
}

/* -------------------------------- Reading -------------------------------- */

export interface TrendQuery {
  status?: TrendStatus;
  source?: TrendSource;
  page?: number;
  pageSize?: number;
}

export async function listTrendSignals(query: TrendQuery = {}) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 30));

  const filters = [
    query.status ? eq(trendSignals.status, query.status) : undefined,
    query.source ? eq(trendSignals.source, query.source) : undefined,
  ].filter(Boolean);

  const where = filters.length > 0 ? and(...(filters as never[])) : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: trendSignals.id,
        label: trendSignals.label,
        source: trendSignals.source,
        score: trendSignals.score,
        rationale: trendSignals.rationale,
        status: trendSignals.status,
        categoryId: trendSignals.categoryId,
        categoryName: categories.name,
        usedAt: trendSignals.usedAt,
        createdAt: trendSignals.createdAt,
      })
      .from(trendSignals)
      .leftJoin(categories, eq(trendSignals.categoryId, categories.id))
      .where(where as never)
      .orderBy(desc(trendSignals.score), desc(trendSignals.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: sql<number>`count(*)` })
      .from(trendSignals)
      .where(where as never),
  ]);

  return { items, page, pageSize, total: Number(totalRows[0]?.value ?? 0) };
}

/**
 * The best unused signals, for the idea generator and the runner's top-up.
 *
 * Ordered by score then recency. Does not mark anything used — the caller does
 * that once it has actually committed the work, so a failed enqueue leaves the
 * signal available.
 */
export async function takeUnusedSignals(limit = 10) {
  return db
    .select({
      id: trendSignals.id,
      label: trendSignals.label,
      source: trendSignals.source,
      score: trendSignals.score,
      categoryId: trendSignals.categoryId,
    })
    .from(trendSignals)
    .where(eq(trendSignals.status, 'new'))
    .orderBy(desc(trendSignals.score), desc(trendSignals.createdAt))
    .limit(limit);
}

export async function markSignals(ids: string[], status: TrendStatus): Promise<number> {
  if (ids.length === 0) return 0;
  await db
    .update(trendSignals)
    .set({
      status,
      usedAt: status === 'used' ? nowSec() : null,
      updatedAt: nowSec(),
    })
    .where(inArray(trendSignals.id, ids));
  return ids.length;
}

export async function addManualSignal(input: {
  label: string;
  categoryId?: string | null;
  score?: number;
  rationale?: string;
}): Promise<number> {
  return recordSignals([
    {
      label: input.label,
      source: 'manual',
      // Operator-entered topics outrank everything mined: someone decided this
      // matters, which is better evidence than any heuristic here.
      score: input.score ?? 95,
      rationale: input.rationale ?? 'Added by an operator.',
      categoryId: input.categoryId ?? null,
    },
  ]);
}

export async function trendCounts(): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: trendSignals.status, value: sql<number>`count(*)` })
    .from(trendSignals)
    .groupBy(trendSignals.status);

  const out: Record<string, number> = { new: 0, queued: 0, used: 0, dismissed: 0 };
  for (const row of rows) out[row.status] = Number(row.value);
  return out;
}
