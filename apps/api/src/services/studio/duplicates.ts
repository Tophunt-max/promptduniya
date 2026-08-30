import { db, prompts } from '@pd/db';
import { and, desc, eq, ne, or, sql } from 'drizzle-orm';

/**
 * Near-duplicate detection for generated prompts.
 *
 * The trend scanner will rediscover the same topic — "Diwali couple portrait"
 * is trending every October, and an idea generator asked for ten wedding themes
 * will produce two that are the same idea in different words. Without a gate the
 * catalogue slowly fills with variations of its own most popular post, which is
 * bad for readers and actively harmful for search: near-identical pages compete
 * with each other and both rank worse.
 *
 * `createPrompt` already de-duplicates *slugs*, but that only stops a collision
 * on the URL. "Diwali Couple Portrait" and "Couple Diwali Portraits" get two
 * different slugs and are the same post.
 *
 * Approach: token-set similarity over the title, plus a shingle comparison of
 * the prompt body, against a candidate set narrowed by SQL.
 *
 * Why not embeddings — which would be more accurate:
 *
 *   1. It would add a second AI call per item, on the path most likely to be
 *      rate-limited, to answer a question that trigram overlap answers well
 *      enough for prompt titles that share a fixed domain vocabulary.
 *   2. D1 has no vector type, so the vectors would need Vectorize: another
 *      binding, another failure mode, and a second store to keep in sync with
 *      the prompts table.
 *
 * The narrowing step matters for cost. Comparing against every published prompt
 * would mean reading the whole table into the isolate on every generated item.
 * Instead SQL filters to rows that share a significant word with the candidate,
 * and the expensive scoring runs only on those.
 */

export interface DuplicateMatch {
  promptId: string;
  slug: string;
  title: string;
  /** 0-100. Higher means more alike. */
  score: number;
  /** Which signal produced the score, for the admin console. */
  reason: 'exact-title' | 'title-overlap' | 'body-overlap';
}

export interface DuplicateResult {
  isDuplicate: boolean;
  /** The strongest match found, whether or not it crossed the threshold. */
  match: DuplicateMatch | null;
  /** Everything scored above half the threshold, for operator context. */
  near: DuplicateMatch[];
  threshold: number;
}

export interface DuplicateInput {
  title: string;
  promptText: string;
  tags?: string[];
  /** Excluded from comparison — used when re-checking an existing prompt. */
  ignorePromptId?: string;
  /** 50-100. Below this, an item is allowed through. */
  threshold?: number;
}

/**
 * Words too common in this catalogue to carry any signal.
 *
 * Every prompt is an Indian AI portrait prompt, so "indian", "portrait", "ai"
 * and "prompt" appear in most titles. Left in, they push the similarity of two
 * unrelated prompts up to around 40% and make the threshold meaningless.
 */
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'for',
  'with',
  'in',
  'on',
  'at',
  'of',
  'to',
  'by',
  'from',
  'into',
  'your',
  'you',
  'this',
  'that',
  'is',
  'are',
  'be',
  'ai',
  'prompt',
  'prompts',
  'image',
  'photo',
  'photograph',
  'picture',
  'portrait',
  'indian',
  'india',
  'style',
  'shot',
  'best',
  'new',
  'top',
  'viral',
  'trending',
  'aesthetic',
  'beautiful',
]);

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function tokenSet(text: string): Set<string> {
  return new Set(tokenise(text));
}

/** Jaccard similarity, 0-1. Symmetric, so order of arguments does not matter. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * Overlapping word triples from a body of text.
 *
 * Shingles rather than a bag of words because two prompts in this catalogue
 * necessarily share most of their individual vocabulary — saree, light, lens,
 * warm. What distinguishes a copy from a sibling is shared *phrasing*, and a
 * three-word window captures that while tolerating small edits.
 */
function shingles(text: string, size = 3): Set<string> {
  const tokens = tokenise(text);
  const out = new Set<string>();
  for (let i = 0; i + size <= tokens.length; i += 1) {
    out.add(tokens.slice(i, i + size).join(' '));
  }
  return out;
}

/** Normalised title used for the cheap exact-match check. */
function normaliseTitle(title: string): string {
  return tokenise(title).sort().join(' ');
}

/**
 * Narrows the comparison set with SQL before scoring anything in JS.
 *
 * Builds an OR of LIKE clauses over the distinctive words in the title. This
 * uses the existing `prompts_search_idx` on `search_text` where SQLite can, and
 * where it cannot it is still a single scan rather than a full table read into
 * memory. Capped, and ordered newest-first, because a duplicate of something
 * published this week is the case worth catching — the trend scanner rediscovers
 * recent topics, not three-year-old ones.
 */
async function candidates(input: DuplicateInput, titleTokens: string[]) {
  const probes = titleTokens.slice(0, 6);

  const clauses = probes.map((token) => sql`${prompts.searchText} like ${'%' + token + '%'}`);
  const filters = [
    // Compare against drafts too. A duplicate sitting unpublished in the queue
    // is still a duplicate, and publishing it later would be the same problem
    // deferred rather than avoided.
    clauses.length > 0 ? or(...clauses) : undefined,
    input.ignorePromptId ? ne(prompts.id, input.ignorePromptId) : undefined,
  ].filter(Boolean);

  return db
    .select({
      id: prompts.id,
      slug: prompts.slug,
      title: prompts.title,
      promptText: prompts.promptText,
      searchText: prompts.searchText,
    })
    .from(prompts)
    .where(filters.length > 1 ? and(...(filters as never[])) : ((filters[0] ?? undefined) as never))
    .orderBy(desc(prompts.createdAt))
    .limit(240);
}

export async function findDuplicate(input: DuplicateInput): Promise<DuplicateResult> {
  const threshold = Math.min(100, Math.max(50, input.threshold ?? 82));
  const titleTokens = tokenise(input.title);
  const titleSet = new Set(titleTokens);
  const bodyShingles = shingles(input.promptText);
  const normalisedTitle = normaliseTitle(input.title);

  // Nothing distinctive to compare — a one-word title like "Diwali". Let it
  // through rather than guessing; the quality gate will catch a thin prompt.
  if (titleTokens.length === 0) {
    return { isDuplicate: false, match: null, near: [], threshold };
  }

  // Cheap path first: an exact normalised-title hit is a duplicate regardless of
  // what the body says, and it is one indexed comparison rather than 240.
  const rows = await candidates(input, titleTokens);

  const scored: DuplicateMatch[] = [];

  for (const row of rows) {
    if (normaliseTitle(row.title) === normalisedTitle) {
      scored.push({
        promptId: row.id,
        slug: row.slug,
        title: row.title,
        score: 100,
        reason: 'exact-title',
      });
      continue;
    }

    const titleScore = jaccard(titleSet, tokenSet(row.title));
    const bodyScore = jaccard(bodyShingles, shingles(row.promptText ?? ''));

    // Weighted towards the title. Two prompts with the same title are the same
    // post to a reader and to a search engine even if the bodies differ; two
    // prompts with different titles and similar bodies are usually a legitimate
    // pair of variations on a theme, which the catalogue is meant to have.
    const combined = titleScore * 0.65 + bodyScore * 0.35;

    const score = Math.round(Math.max(combined, bodyScore * 0.95) * 100);
    if (score <= 0) continue;

    scored.push({
      promptId: row.id,
      slug: row.slug,
      title: row.title,
      score,
      reason: titleScore >= bodyScore ? 'title-overlap' : 'body-overlap',
    });
  }

  scored.sort((a, b) => b.score - a.score);

  const match = scored[0] ?? null;
  const near = scored.filter((candidate) => candidate.score >= threshold / 2).slice(0, 5);

  return {
    isDuplicate: Boolean(match && match.score >= threshold),
    match,
    near,
    threshold,
  };
}

/**
 * Whether an identical theme has already been queued or written.
 *
 * A much cheaper pre-flight than `findDuplicate`, run before spending a model
 * call rather than after. Catches the common case where the idea generator
 * returns a theme the queue already holds.
 */
export async function themeAlreadyUsed(theme: string): Promise<boolean> {
  const normalised = normaliseTitle(theme);
  if (!normalised) return false;

  const probes = tokenise(theme).slice(0, 4);
  if (probes.length === 0) return false;

  const rows = await db
    .select({ title: prompts.title })
    .from(prompts)
    .where(or(...probes.map((token) => sql`${prompts.searchText} like ${'%' + token + '%'}`)))
    .limit(120);

  return rows.some((row) => normaliseTitle(row.title) === normalised);
}

/** Exposed for tests and for the admin "check this prompt" action. */
export const __internals = { tokenise, jaccard, shingles, normaliseTitle };

/** Re-check an existing catalogue prompt against the rest of the catalogue. */
export async function findDuplicateOfPrompt(promptId: string): Promise<DuplicateResult | null> {
  const row = await db
    .select({ title: prompts.title, promptText: prompts.promptText })
    .from(prompts)
    .where(eq(prompts.id, promptId))
    .limit(1);

  const target = row[0];
  if (!target) return null;

  return findDuplicate({
    title: target.title,
    promptText: target.promptText ?? '',
    ignorePromptId: promptId,
  });
}
