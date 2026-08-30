import { categories, db, promptTags, prompts, tags } from '@pd/db';
import { slugify } from '@pd/shared';
import { and, count, eq, inArray, sql } from 'drizzle-orm';

import { newId } from '../lib/crypto';
import { nowSec } from '../lib/dates';
import { AppError } from '../lib/errors';

/**
 * Bulk prompt operations.
 *
 * Every prompt mutation in services/prompts.ts is `:id`-scoped, which is correct
 * for the editor and painful everywhere else: publishing a batch of forty drafts
 * meant forty round trips driven by forty clicks, and there was no way at all to
 * re-file a mis-categorised group or strip a bad tag from everything carrying it.
 *
 * Kept in its own module rather than added to services/prompts.ts, which is
 * already ~900 lines covering the public read paths, the admin single-row writes
 * and the trending recompute. These share only the table.
 *
 * Two rules throughout:
 *
 * 1. **Cap the batch.** An unbounded `inArray` becomes an unbounded SQL
 *    statement, and D1 has a hard ceiling on bound parameters. Every entry point
 *    validates the id count before touching the database, so the failure is a
 *    clear 400 rather than a driver error.
 *
 * 2. **Fix the denormalised counts.** `categories.promptCount` and
 *    `tags.usageCount` are cached on their rows and read by the public site. A
 *    bulk write that skipped them would leave the category grid and the tag cloud
 *    quietly wrong, which is the kind of bug nobody reports and everybody sees.
 */

/** Above this, do it in two batches. Keeps the statement well inside D1's limits. */
const MAX_BATCH = 200;

export interface BulkResult {
  /** Rows the operation actually changed. */
  affected: number;
  /** Ids that did not resolve to a prompt — usually a stale client selection. */
  missing: string[];
}

function assertBatch(ids: string[]): string[] {
  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))];
  if (unique.length === 0) throw AppError.badRequest('Select at least one prompt');
  if (unique.length > MAX_BATCH) {
    throw AppError.badRequest(`Select at most ${MAX_BATCH} prompts at a time`);
  }
  return unique;
}

/**
 * Loads the target rows once, up front.
 *
 * Every operation needs the same two things: which of the requested ids are real,
 * and which categories are affected so their counts can be refreshed afterwards.
 */
async function loadTargets(ids: string[]) {
  const rows = await db
    .select({ id: prompts.id, categoryId: prompts.categoryId, isPublished: prompts.isPublished })
    .from(prompts)
    .where(inArray(prompts.id, ids));

  const found = new Set(rows.map((row) => row.id));
  return {
    rows,
    missing: ids.filter((id) => !found.has(id)),
    categoryIds: [...new Set(rows.map((row) => row.categoryId))],
  };
}

/** Recomputes the cached published count for each affected category. */
async function refreshCategoryCounts(categoryIds: string[]): Promise<void> {
  for (const categoryId of categoryIds) {
    const [row] = await db
      .select({ value: count() })
      .from(prompts)
      .where(and(eq(prompts.categoryId, categoryId), eq(prompts.isPublished, true)));
    await db
      .update(categories)
      .set({ promptCount: row?.value ?? 0 })
      .where(eq(categories.id, categoryId));
  }
}

/** Recomputes `usageCount` for each tag touched by a bulk tag change. */
async function refreshTagCounts(tagIds: string[]): Promise<void> {
  for (const tagId of [...new Set(tagIds)]) {
    const [row] = await db
      .select({ value: count() })
      .from(promptTags)
      .where(eq(promptTags.tagId, tagId));
    await db
      .update(tags)
      .set({ usageCount: row?.value ?? 0, updatedAt: nowSec() })
      .where(eq(tags.id, tagId));
  }
}

/* -------------------------------- Publishing ------------------------------ */

/**
 * Publishes or unpublishes a batch.
 *
 * `publishedAt` is only stamped on rows that have never had one, matching
 * `setPromptPublished`. Overwriting it on every re-publish would silently reorder
 * the public listing — a prompt briefly unpublished to fix a typo would jump to
 * the top of "latest" as though it were new.
 */
export async function bulkSetPublished(
  ids: string[],
  isPublished: boolean,
): Promise<BulkResult> {
  const unique = assertBatch(ids);
  const { rows, missing, categoryIds } = await loadTargets(unique);
  if (rows.length === 0) return { affected: 0, missing };

  const now = nowSec();
  const targetIds = rows.map((row) => row.id);

  await db
    .update(prompts)
    .set(
      isPublished
        ? {
            isPublished: true,
            publishedAt: sql`coalesce(${prompts.publishedAt}, ${now})`,
            updatedAt: now,
          }
        : { isPublished: false, updatedAt: now },
    )
    .where(inArray(prompts.id, targetIds));

  await refreshCategoryCounts(categoryIds);
  return { affected: targetIds.length, missing };
}

/**
 * Schedules a batch to publish at a given time.
 *
 * Forces `isPublished` to false: the hourly sweep in `publishScheduled()` only
 * looks at unpublished rows, so scheduling something already live would set a
 * date that never fires and read as a pending change that silently never happens.
 */
export async function bulkSchedule(ids: string[], scheduledFor: number): Promise<BulkResult> {
  const unique = assertBatch(ids);
  if (!Number.isFinite(scheduledFor) || scheduledFor <= 0) {
    throw AppError.badRequest('Choose a valid date and time');
  }

  const { rows, missing, categoryIds } = await loadTargets(unique);
  if (rows.length === 0) return { affected: 0, missing };

  const now = nowSec();
  await db
    .update(prompts)
    .set({ scheduledFor, isPublished: false, updatedAt: now })
    .where(
      inArray(
        prompts.id,
        rows.map((row) => row.id),
      ),
    );

  await refreshCategoryCounts(categoryIds);
  return { affected: rows.length, missing };
}

/** Clears a pending schedule without changing publication state. */
export async function bulkClearSchedule(ids: string[]): Promise<BulkResult> {
  const unique = assertBatch(ids);
  const { rows, missing } = await loadTargets(unique);
  if (rows.length === 0) return { affected: 0, missing };

  await db
    .update(prompts)
    .set({ scheduledFor: null, updatedAt: nowSec() })
    .where(
      inArray(
        prompts.id,
        rows.map((row) => row.id),
      ),
    );

  return { affected: rows.length, missing };
}

/* ---------------------------------- Flags --------------------------------- */

export type PromptFlag = 'isFeatured' | 'isTrending' | 'isEditorsPick' | 'isPremium';

const FLAGS: PromptFlag[] = ['isFeatured', 'isTrending', 'isEditorsPick', 'isPremium'];

export async function bulkSetFlags(
  ids: string[],
  flags: Partial<Record<PromptFlag, boolean>>,
): Promise<BulkResult> {
  const unique = assertBatch(ids);

  const patch: Record<string, unknown> = { updatedAt: nowSec() };
  for (const flag of FLAGS) {
    if (typeof flags[flag] === 'boolean') patch[flag] = flags[flag];
  }
  // Only `updatedAt` would change — refuse rather than bump timestamps for nothing.
  if (Object.keys(patch).length === 1) throw AppError.badRequest('No flags were supplied');

  const { rows, missing } = await loadTargets(unique);
  if (rows.length === 0) return { affected: 0, missing };

  await db
    .update(prompts)
    .set(patch)
    .where(
      inArray(
        prompts.id,
        rows.map((row) => row.id),
      ),
    );

  return { affected: rows.length, missing };
}

/* -------------------------------- Category -------------------------------- */

/**
 * Re-files a batch into another category.
 *
 * Both the old and new categories need their counts refreshed, which is why
 * `loadTargets` returns the originating category ids rather than the operation
 * assuming a single source.
 */
export async function bulkSetCategory(ids: string[], categoryId: string): Promise<BulkResult> {
  const unique = assertBatch(ids);

  const category = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  if (!category[0]) throw AppError.badRequest('Unknown category');

  const { rows, missing, categoryIds } = await loadTargets(unique);
  if (rows.length === 0) return { affected: 0, missing };

  await db
    .update(prompts)
    .set({ categoryId, updatedAt: nowSec() })
    .where(
      inArray(
        prompts.id,
        rows.map((row) => row.id),
      ),
    );

  await refreshCategoryCounts([...new Set([...categoryIds, categoryId])]);
  return { affected: rows.length, missing };
}

/* ---------------------------------- Tags ---------------------------------- */

/** Resolves tag names to ids, creating any that do not exist yet. */
async function resolveTagIds(names: string[]): Promise<string[]> {
  const ids: string[] = [];

  for (const raw of [...new Set(names.map((name) => name.trim()).filter(Boolean))]) {
    const slug = slugify(raw);
    if (!slug) continue;

    const existing = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.slug, slug))
      .limit(1);

    if (existing[0]) {
      ids.push(existing[0].id);
      continue;
    }

    const id = newId();
    await db.insert(tags).values({ id, name: raw.slice(0, 60), slug, usageCount: 0 });
    ids.push(id);
  }

  return ids;
}

/**
 * Adds tags to a batch without disturbing the tags already there.
 *
 * `onConflictDoNothing` against the composite primary key makes this idempotent,
 * so re-running it over an overlapping selection is safe.
 */
export async function bulkAddTags(ids: string[], names: string[]): Promise<BulkResult> {
  const unique = assertBatch(ids);
  const tagIds = await resolveTagIds(names);
  if (tagIds.length === 0) throw AppError.badRequest('No usable tag names were supplied');

  const { rows, missing } = await loadTargets(unique);
  if (rows.length === 0) return { affected: 0, missing };

  const links = rows.flatMap((row) => tagIds.map((tagId) => ({ promptId: row.id, tagId })));
  for (let i = 0; i < links.length; i += 50) {
    await db.insert(promptTags).values(links.slice(i, i + 50)).onConflictDoNothing();
  }

  await refreshTagCounts(tagIds);
  return { affected: rows.length, missing };
}

/** Strips tags from a batch. Tag rows survive; only the links go. */
export async function bulkRemoveTags(ids: string[], names: string[]): Promise<BulkResult> {
  const unique = assertBatch(ids);

  const slugs = [...new Set(names.map((name) => slugify(name.trim())).filter(Boolean))];
  if (slugs.length === 0) throw AppError.badRequest('No usable tag names were supplied');

  const found = await db
    .select({ id: tags.id })
    .from(tags)
    .where(inArray(tags.slug, slugs));
  const tagIds = found.map((row) => row.id);
  if (tagIds.length === 0) return { affected: 0, missing: [] };

  const { rows, missing } = await loadTargets(unique);
  if (rows.length === 0) return { affected: 0, missing };

  await db
    .delete(promptTags)
    .where(
      and(
        inArray(
          promptTags.promptId,
          rows.map((row) => row.id),
        ),
        inArray(promptTags.tagId, tagIds),
      ),
    );

  await refreshTagCounts(tagIds);
  return { affected: rows.length, missing };
}

/* --------------------------------- Deletion ------------------------------- */

/**
 * Deletes a batch.
 *
 * Capped harder than the other operations. This is the one action here that
 * cannot be undone, and a 200-row delete from a mis-click is a far worse outcome
 * than having to confirm twice.
 */
export async function bulkDelete(ids: string[]): Promise<BulkResult> {
  const unique = assertBatch(ids);
  if (unique.length > 50) {
    throw AppError.badRequest('Delete at most 50 prompts at a time');
  }

  const { rows, missing, categoryIds } = await loadTargets(unique);
  if (rows.length === 0) return { affected: 0, missing };

  const targetIds = rows.map((row) => row.id);

  // Read the affected tags before the rows go: prompt_tags cascades on delete,
  // so afterwards there is nothing left to tell us which counts to refresh.
  const affectedTags = await db
    .select({ tagId: promptTags.tagId })
    .from(promptTags)
    .where(inArray(promptTags.promptId, targetIds));

  await db.delete(prompts).where(inArray(prompts.id, targetIds));

  await refreshCategoryCounts(categoryIds);
  await refreshTagCounts(affectedTags.map((row) => row.tagId));

  return { affected: targetIds.length, missing };
}
