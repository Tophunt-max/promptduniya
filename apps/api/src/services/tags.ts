import { db, promptTags, prompts, tags } from '@pd/db';
import { slugify } from '@pd/shared';
import { and, count, desc, eq, inArray, like, ne, sql } from 'drizzle-orm';

import { newId } from '../lib/crypto';
import { nowSec } from '../lib/dates';
import { AppError } from '../lib/errors';

/**
 * Tag administration.
 *
 * Tags were previously write-only by side effect. The only code that touched
 * them was a private `upsertTags` helper in services/prompts.ts, called whenever
 * a prompt was saved: it created any tag it had not seen before and never
 * removed anything. There was no way to rename a tag, merge two spellings of the
 * same idea, or delete one — so the vocabulary could only ever grow.
 *
 * That was survivable while a human typed every tag. It is not survivable now
 * that the automation pipeline writes them: a language model asked for tags on a
 * thousand prompts will produce "pre wedding", "pre-wedding", "prewedding" and
 * "pre wedding shoot", and every one of them becomes a permanent public facet
 * with its own thin listing page. Merging is the operation that matters most
 * here, which is why it gets the careful implementation below.
 *
 * `usageCount` is denormalised onto the row and read by the public site's tag
 * cloud, so every mutation here has to leave it correct.
 */

export interface AdminTagRow {
  id: string;
  name: string;
  slug: string;
  usageCount: number;
  /** Recomputed from `prompt_tags`, so a drifted `usageCount` is visible. */
  actualCount: number;
  createdAt: number;
}

export interface TagQuery {
  q?: string;
  /** Only tags attached to nothing. These are the ones worth pruning. */
  unusedOnly?: boolean;
  page?: number;
  pageSize?: number;
}

/**
 * Lists tags with both the stored and the true usage count.
 *
 * Returning both is deliberate. `usageCount` is what the public site displays,
 * and `actualCount` is the truth; showing them side by side turns a silent
 * denormalisation bug into something an operator can see and fix with the
 * recount action, rather than something that quietly misreports the tag cloud.
 */
export async function adminListTags(query: TagQuery = {}): Promise<{
  items: AdminTagRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));

  const search = query.q?.trim().toLowerCase();
  const filters = [
    search ? like(sql`lower(${tags.name})`, `%${search}%`) : undefined,
    query.unusedOnly ? eq(tags.usageCount, 0) : undefined,
  ].filter(Boolean);

  const where = filters.length > 0 ? and(...(filters as never[])) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        usageCount: tags.usageCount,
        createdAt: tags.createdAt,
        actualCount: sql<number>`(
          select count(*) from ${promptTags} where ${promptTags.tagId} = ${tags.id}
        )`,
      })
      .from(tags)
      .where(where as never)
      .orderBy(desc(tags.usageCount), tags.name)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(tags)
      .where(where as never),
  ]);

  return {
    items: rows.map((row) => ({ ...row, actualCount: Number(row.actualCount) })),
    total: totalRows[0]?.value ?? 0,
    page,
    pageSize,
  };
}

async function getTag(id: string) {
  const rows = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
  const tag = rows[0];
  if (!tag) throw AppError.notFound('Tag not found');
  return tag;
}

/** Live count from the join table — the authority for `usageCount`. */
async function trueCount(tagId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(promptTags)
    .where(eq(promptTags.tagId, tagId));
  return rows[0]?.value ?? 0;
}

/**
 * Renames a tag, and re-slugs it to match.
 *
 * The slug moves with the name because it is the tag's public URL, and leaving a
 * renamed tag on its old slug produces a page whose address contradicts its
 * heading. That does change an existing URL — acceptable for an admin-initiated
 * rename, and the alternative (name and slug drifting apart permanently) is
 * worse.
 *
 * If the new slug already belongs to another tag this is really a merge, so it
 * says so rather than failing on the unique index with a database error.
 */
export async function renameTag(id: string, name: string): Promise<AdminTagRow> {
  const tag = await getTag(id);
  const trimmed = name.trim();
  if (!trimmed) throw AppError.badRequest('A tag name is required');

  const slug = slugify(trimmed);
  if (!slug) throw AppError.badRequest('That name does not produce a usable slug');

  const clash = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.slug, slug), ne(tags.id, id)))
    .limit(1);

  if (clash[0]) {
    throw AppError.badRequest(
      `"${clash[0].name}" already uses the slug "${slug}". Merge into it instead of renaming.`,
    );
  }

  await db
    .update(tags)
    .set({ name: trimmed.slice(0, 60), slug, updatedAt: nowSec() })
    .where(eq(tags.id, id));

  return {
    id: tag.id,
    name: trimmed,
    slug,
    usageCount: tag.usageCount,
    actualCount: await trueCount(tag.id),
    createdAt: tag.createdAt,
  };
}

export interface MergeResult {
  targetId: string;
  targetName: string;
  mergedTagCount: number;
  /** Prompts that gained the target tag. */
  repointed: number;
  /** Links dropped because the prompt already carried the target tag. */
  duplicatesDropped: number;
}

/**
 * Folds one or more tags into a target tag.
 *
 * The awkward part is the join table's composite primary key
 * `(prompt_id, tag_id)`. A plain `UPDATE prompt_tags SET tag_id = target` fails
 * the moment any prompt carries both the source and the target tag, which is
 * exactly the common case — someone tagged a post "pre wedding" *and*
 * "pre-wedding". So the rows are partitioned first: links whose prompt does not
 * already have the target are repointed, and the rest are deleted as redundant.
 *
 * Doing it the other way round (delete first, then repoint) would be simpler to
 * read and would lose data on the second step's failure. This order means a
 * failure part-way through leaves duplicates, which is harmless and idempotent
 * on a retry.
 */
export async function mergeTags(input: {
  sourceIds: string[];
  targetId: string;
}): Promise<MergeResult> {
  const target = await getTag(input.targetId);

  const sourceIds = [...new Set(input.sourceIds)].filter((id) => id !== input.targetId);
  if (sourceIds.length === 0) {
    throw AppError.badRequest('Choose at least one other tag to merge into this one');
  }

  const sources = await db.select({ id: tags.id }).from(tags).where(inArray(tags.id, sourceIds));
  if (sources.length !== sourceIds.length) throw AppError.badRequest('One of those tags no longer exists');

  // Prompts that already carry the target — their source links are redundant.
  const alreadyTagged = await db
    .select({ promptId: promptTags.promptId })
    .from(promptTags)
    .where(eq(promptTags.tagId, input.targetId));
  const haveTarget = new Set(alreadyTagged.map((row) => row.promptId));

  const sourceLinks = await db
    .select({ promptId: promptTags.promptId, tagId: promptTags.tagId })
    .from(promptTags)
    .where(inArray(promptTags.tagId, sourceIds));

  const toRepoint = sourceLinks.filter((link) => !haveTarget.has(link.promptId));
  const duplicates = sourceLinks.length - toRepoint.length;

  // De-duplicate by prompt: two source tags on the same prompt must produce one
  // target link, not two, or the insert violates the primary key.
  const uniquePromptIds = [...new Set(toRepoint.map((link) => link.promptId))];

  for (let i = 0; i < uniquePromptIds.length; i += 25) {
    const chunk = uniquePromptIds.slice(i, i + 25);
    await db
      .insert(promptTags)
      .values(chunk.map((promptId) => ({ promptId, tagId: input.targetId })))
      .onConflictDoNothing();
  }

  // Dropping the source tags cascades their links away (prompt_tags.tag_id has
  // ON DELETE CASCADE), so there is no separate cleanup.
  await db.delete(tags).where(inArray(tags.id, sourceIds));

  await recountTags([input.targetId]);

  return {
    targetId: target.id,
    targetName: target.name,
    mergedTagCount: sourceIds.length,
    repointed: uniquePromptIds.length,
    duplicatesDropped: duplicates,
  };
}

/**
 * Deletes a tag outright.
 *
 * Refuses when the tag is still attached to prompts unless `force` is set,
 * because the destructive case and the tidy-up case deserve different levels of
 * confirmation: pruning an orphan is routine, detaching a tag from ninety live
 * prompts is not.
 */
export async function deleteTag(id: string, options: { force?: boolean } = {}): Promise<void> {
  const tag = await getTag(id);
  const attached = await trueCount(id);

  if (attached > 0 && !options.force) {
    throw AppError.badRequest(
      `"${tag.name}" is still on ${attached} prompt(s). Merge it into another tag, or confirm to remove it from all of them.`,
    );
  }

  // The join rows go with it via ON DELETE CASCADE.
  await db.delete(tags).where(eq(tags.id, id));
}

/** Removes every tag attached to nothing. The routine tidy-up. */
export async function pruneUnusedTags(): Promise<{ removed: number; names: string[] }> {
  const orphans = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(
      sql`not exists (select 1 from ${promptTags} where ${promptTags.tagId} = ${tags.id})`,
    )
    .limit(500);

  if (orphans.length === 0) return { removed: 0, names: [] };

  const ids = orphans.map((row) => row.id);
  for (let i = 0; i < ids.length; i += 50) {
    await db.delete(tags).where(inArray(tags.id, ids.slice(i, i + 50)));
  }

  return { removed: orphans.length, names: orphans.map((row) => row.name).slice(0, 20) };
}

/**
 * Rebuilds `usageCount` from the join table.
 *
 * Needed because the count is maintained incrementally on prompt save, and any
 * path that bypasses that — a merge, a cascade from a deleted prompt, an
 * interrupted write — leaves it stale. With no argument it repairs every tag.
 */
export async function recountTags(ids?: string[]): Promise<number> {
  const targets = ids?.length
    ? await db.select({ id: tags.id }).from(tags).where(inArray(tags.id, ids))
    : await db.select({ id: tags.id }).from(tags).limit(2000);

  for (const tag of targets) {
    await db
      .update(tags)
      .set({ usageCount: await trueCount(tag.id), updatedAt: nowSec() })
      .where(eq(tags.id, tag.id));
  }

  return targets.length;
}

/**
 * Creates a tag up front, so an operator can establish preferred wording before
 * anything is tagged with a variant of it.
 */
export async function createTag(name: string): Promise<AdminTagRow> {
  const trimmed = name.trim();
  if (!trimmed) throw AppError.badRequest('A tag name is required');

  const slug = slugify(trimmed);
  if (!slug) throw AppError.badRequest('That name does not produce a usable slug');

  const existing = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(eq(tags.slug, slug))
    .limit(1);
  if (existing[0]) throw AppError.badRequest(`"${existing[0].name}" already uses that slug`);

  const id = newId();
  await db.insert(tags).values({ id, name: trimmed.slice(0, 60), slug, usageCount: 0 });

  return { id, name: trimmed, slug, usageCount: 0, actualCount: 0, createdAt: nowSec() };
}

/** The prompts carrying a tag — the drill-down from the tag table. */
export async function promptsForTag(tagId: string, limit = 50) {
  return db
    .select({
      id: prompts.id,
      title: prompts.title,
      slug: prompts.slug,
      isPublished: prompts.isPublished,
    })
    .from(promptTags)
    .innerJoin(prompts, eq(promptTags.promptId, prompts.id))
    .where(eq(promptTags.tagId, tagId))
    .orderBy(desc(prompts.createdAt))
    .limit(limit);
}
