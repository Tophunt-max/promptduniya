import { and, asc, count, desc, eq, gt, inArray, like, ne, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import {
  categories,
  favorites,
  likes,
  promptImages,
  promptTags,
  promptViews,
  prompts,
  tags,
  users,
} from '@/db/schema';
import { AppError } from '@/lib/api';
import { PAGE_SIZE, type SortOption } from '@/lib/constants';
import { dayBucket, nowSec } from '@/lib/dates';
import { newId } from '@/lib/id';
import { slugify } from '@/lib/utils';
import type { PromptListQuery, PromptWriteInput } from '@/lib/validation';

/**
 * Prompt reads and writes.
 *
 * Public listings only ever expose published prompts. The full `promptText` of
 * a premium prompt is stripped from list payloads and gated in `getPromptBySlug`
 * so an unauthorised client never receives paid content, even in the HTML.
 */

export interface PromptCardData {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  aiModel: string;
  categoryName: string;
  categorySlug: string;
  style: string | null;
  aspectRatio: string | null;
  gender: string | null;
  difficulty: string;
  isPremium: boolean;
  isTrending: boolean;
  isFeatured: boolean;
  isEditorsPick: boolean;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  viewCount: number;
  copyCount: number;
  likeCount: number;
  favoriteCount: number;
  publishedAt: number | null;
  createdAt: number;
  likedByMe?: boolean;
  savedByMe?: boolean;
}

export interface PromptDetailData extends PromptCardData {
  promptText: string | null;
  negativePrompt: string | null;
  usageInstructions: string | null;
  ageGroup: string | null;
  location: string | null;
  cameraStyle: string | null;
  lighting: string | null;
  mood: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: number;
  authorName: string | null;
  authorUsername: string | null;
  tags: { name: string; slug: string }[];
  images: {
    id: string;
    url: string;
    thumbnailUrl: string | null;
    alt: string | null;
    width: number | null;
    height: number | null;
  }[];
  /** True when the body was withheld because the viewer lacks entitlement. */
  locked: boolean;
}

const cardColumns = {
  id: prompts.id,
  title: prompts.title,
  slug: prompts.slug,
  shortDescription: prompts.shortDescription,
  aiModel: prompts.aiModel,
  categoryName: categories.name,
  categorySlug: categories.slug,
  style: prompts.style,
  aspectRatio: prompts.aspectRatio,
  gender: prompts.gender,
  difficulty: prompts.difficulty,
  isPremium: prompts.isPremium,
  isTrending: prompts.isTrending,
  isFeatured: prompts.isFeatured,
  isEditorsPick: prompts.isEditorsPick,
  coverImageUrl: prompts.coverImageUrl,
  coverImageAlt: prompts.coverImageAlt,
  viewCount: prompts.viewCount,
  copyCount: prompts.copyCount,
  likeCount: prompts.likeCount,
  favoriteCount: prompts.favoriteCount,
  publishedAt: prompts.publishedAt,
  createdAt: prompts.createdAt,
};

function publishedFilter(): SQL {
  return and(
    eq(prompts.isPublished, true),
    or(sql`${prompts.publishedAt} is null`, sql`${prompts.publishedAt} <= ${nowSec()}`),
  )!;
}

function orderFor(sort: SortOption) {
  switch (sort) {
    case 'newest':
      return [desc(prompts.publishedAt), desc(prompts.createdAt)];
    case 'most-copied':
      return [desc(prompts.copyCount), desc(prompts.createdAt)];
    case 'most-liked':
      return [desc(prompts.likeCount), desc(prompts.createdAt)];
    case 'most-viewed':
      return [desc(prompts.viewCount), desc(prompts.createdAt)];
    case 'trending':
    default:
      return [desc(prompts.isTrending), desc(prompts.trendingScore), desc(prompts.createdAt)];
  }
}

async function buildFilters(query: Partial<PromptListQuery>): Promise<SQL[]> {
  const filters: SQL[] = [publishedFilter()];

  if (query.category) {
    filters.push(eq(categories.slug, query.category));
  }
  if (query.model) filters.push(eq(prompts.aiModel, query.model));
  if (query.access === 'free') filters.push(eq(prompts.isPremium, false));
  if (query.access === 'premium') filters.push(eq(prompts.isPremium, true));
  if (query.style) filters.push(eq(prompts.style, query.style));
  if (query.gender) filters.push(eq(prompts.gender, query.gender));
  if (query.aspect) filters.push(eq(prompts.aspectRatio, query.aspect));
  if (query.trending) filters.push(eq(prompts.isTrending, true));
  if (query.featured) filters.push(eq(prompts.isFeatured, true));

  if (query.q && query.q.trim().length > 0) {
    const needle = `%${query.q.trim().toLowerCase()}%`;
    filters.push(
      or(
        like(prompts.searchText, needle),
        like(sql`lower(${prompts.title})`, needle),
        like(sql`lower(${prompts.shortDescription})`, needle),
      )!,
    );
  }

  if (query.tag) {
    const tagRows = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, query.tag)).limit(1);
    const tagId = tagRows[0]?.id;
    if (!tagId) {
      filters.push(sql`1 = 0`);
    } else {
      filters.push(
        sql`exists (select 1 from ${promptTags} where ${promptTags.promptId} = ${prompts.id} and ${promptTags.tagId} = ${tagId})`,
      );
    }
  }

  return filters;
}

export interface PromptListResult {
  items: PromptCardData[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

export async function listPrompts(
  query: Partial<PromptListQuery> = {},
  viewerId?: string | null,
): Promise<PromptListResult> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? PAGE_SIZE;
  const filters = await buildFilters(query);
  const where = and(...filters);

  const [rows, totalRows] = await Promise.all([
    db
      .select(cardColumns)
      .from(prompts)
      .innerJoin(categories, eq(categories.id, prompts.categoryId))
      .where(where)
      .orderBy(...orderFor((query.sort as SortOption) ?? 'trending'))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(prompts)
      .innerJoin(categories, eq(categories.id, prompts.categoryId))
      .where(where),
  ]);

  const total = totalRows[0]?.value ?? 0;
  const items = await decorateForViewer(rows, viewerId);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    hasMore: page * pageSize < total,
  };
}

/** Adds per-viewer like/save flags in a single round trip. */
async function decorateForViewer(
  rows: PromptCardData[],
  viewerId?: string | null,
): Promise<PromptCardData[]> {
  if (!viewerId || rows.length === 0) return rows;
  const ids = rows.map((r) => r.id);

  const [likedRows, savedRows] = await Promise.all([
    db
      .select({ promptId: likes.promptId })
      .from(likes)
      .where(and(eq(likes.userId, viewerId), inArray(likes.promptId, ids))),
    db
      .select({ promptId: favorites.promptId })
      .from(favorites)
      .where(and(eq(favorites.userId, viewerId), inArray(favorites.promptId, ids))),
  ]);

  const liked = new Set(likedRows.map((r) => r.promptId));
  const saved = new Set(savedRows.map((r) => r.promptId));
  return rows.map((row) => ({
    ...row,
    likedByMe: liked.has(row.id),
    savedByMe: saved.has(row.id),
  }));
}

export async function trendingPrompts(limit = 8, viewerId?: string | null) {
  const result = await listPrompts({ sort: 'trending', trending: true, pageSize: limit }, viewerId);
  if (result.items.length >= limit) return result.items;
  // Backfill with the most viewed prompts so the section is never sparse.
  const filler = await listPrompts({ sort: 'most-viewed', pageSize: limit }, viewerId);
  const seen = new Set(result.items.map((i) => i.id));
  return [...result.items, ...filler.items.filter((i) => !seen.has(i.id))].slice(0, limit);
}

export async function latestPrompts(limit = 8, viewerId?: string | null) {
  return (await listPrompts({ sort: 'newest', pageSize: limit }, viewerId)).items;
}

export async function featuredPrompts(limit = 6, viewerId?: string | null) {
  return (await listPrompts({ featured: true, sort: 'trending', pageSize: limit }, viewerId)).items;
}

export async function premiumShowcase(limit = 4, viewerId?: string | null) {
  return (await listPrompts({ access: 'premium', sort: 'trending', pageSize: limit }, viewerId)).items;
}

/**
 * Full prompt detail. `canSeePremium` must be the result of a server-side
 * entitlement check — when false the prompt body is replaced with null.
 */
export async function getPromptBySlug(
  slug: string,
  options: { viewerId?: string | null; canSeePremium?: boolean; allowUnpublished?: boolean } = {},
): Promise<PromptDetailData | null> {
  const rows = await db
    .select({
      ...cardColumns,
      promptText: prompts.promptText,
      negativePrompt: prompts.negativePrompt,
      usageInstructions: prompts.usageInstructions,
      ageGroup: prompts.ageGroup,
      location: prompts.location,
      cameraStyle: prompts.cameraStyle,
      lighting: prompts.lighting,
      mood: prompts.mood,
      seoTitle: prompts.seoTitle,
      seoDescription: prompts.seoDescription,
      updatedAt: prompts.updatedAt,
      isPublished: prompts.isPublished,
      authorName: users.name,
      authorUsername: users.username,
    })
    .from(prompts)
    .innerJoin(categories, eq(categories.id, prompts.categoryId))
    .leftJoin(users, eq(users.id, prompts.authorId))
    .where(eq(prompts.slug, slug))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (!row.isPublished && !options.allowUnpublished) return null;

  const [tagRows, imageRows] = await Promise.all([
    db
      .select({ name: tags.name, slug: tags.slug })
      .from(promptTags)
      .innerJoin(tags, eq(tags.id, promptTags.tagId))
      .where(eq(promptTags.promptId, row.id)),
    db
      .select({
        id: promptImages.id,
        url: promptImages.url,
        thumbnailUrl: promptImages.thumbnailUrl,
        alt: promptImages.alt,
        width: promptImages.width,
        height: promptImages.height,
      })
      .from(promptImages)
      .where(eq(promptImages.promptId, row.id))
      .orderBy(asc(promptImages.sortOrder)),
  ]);

  const locked = row.isPremium && !options.canSeePremium;
  const [decorated] = await decorateForViewer([row as PromptCardData], options.viewerId);

  return {
    ...(row as PromptCardData),
    ...decorated,
    promptText: locked ? null : row.promptText,
    negativePrompt: locked ? null : row.negativePrompt,
    usageInstructions: locked ? null : row.usageInstructions,
    ageGroup: row.ageGroup,
    location: row.location,
    cameraStyle: row.cameraStyle,
    lighting: row.lighting,
    mood: row.mood,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    updatedAt: row.updatedAt,
    authorName: row.authorName,
    authorUsername: row.authorUsername,
    tags: tagRows,
    images: imageRows,
    locked,
  };
}

export async function getPromptById(id: string) {
  const rows = await db.select().from(prompts).where(eq(prompts.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function allPromptSlugs(): Promise<{ slug: string; updatedAt: number }[]> {
  return db
    .select({ slug: prompts.slug, updatedAt: prompts.updatedAt })
    .from(prompts)
    .where(publishedFilter())
    .orderBy(desc(prompts.updatedAt));
}

/* ------------------------------ Internal links ----------------------------- */

export interface RelatedGroups {
  related: PromptCardData[];
  sameCategory: PromptCardData[];
  sameModel: PromptCardData[];
  trending: PromptCardData[];
}

export async function relatedPrompts(
  prompt: Pick<PromptDetailData, 'id' | 'categorySlug' | 'aiModel' | 'style'>,
  viewerId?: string | null,
): Promise<RelatedGroups> {
  const exclude = ne(prompts.id, prompt.id);

  const fetchGroup = async (extra: SQL[], limit: number) => {
    const rows = await db
      .select(cardColumns)
      .from(prompts)
      .innerJoin(categories, eq(categories.id, prompts.categoryId))
      .where(and(publishedFilter(), exclude, ...extra))
      .orderBy(desc(prompts.trendingScore), desc(prompts.viewCount))
      .limit(limit);
    return decorateForViewer(rows, viewerId);
  };

  const [sameCategory, sameModel, trending] = await Promise.all([
    fetchGroup([eq(categories.slug, prompt.categorySlug)], 8),
    fetchGroup([eq(prompts.aiModel, prompt.aiModel)], 8),
    fetchGroup([eq(prompts.isTrending, true)], 8),
  ]);

  // "Related" blends category + style for tighter relevance.
  const related = prompt.style
    ? await fetchGroup([eq(prompts.style, prompt.style)], 4)
    : sameCategory.slice(0, 4);

  return { related, sameCategory, sameModel, trending };
}

/* --------------------------------- Counters -------------------------------- */

/** Records a view, de-duplicated per visitor per day. */
export async function recordView(input: {
  promptId: string;
  userId?: string | null;
  visitorHash?: string | null;
  referrer?: string | null;
}): Promise<void> {
  const today = dayBucket();

  if (input.visitorHash) {
    const seen = await db
      .select({ id: promptViews.id })
      .from(promptViews)
      .where(
        and(
          eq(promptViews.promptId, input.promptId),
          eq(promptViews.visitorHash, input.visitorHash),
          eq(promptViews.dayBucket, today),
        ),
      )
      .limit(1);
    if (seen.length > 0) return;
  }

  await db.insert(promptViews).values({
    id: newId(),
    promptId: input.promptId,
    userId: input.userId ?? null,
    visitorHash: input.visitorHash ?? null,
    referrer: input.referrer?.slice(0, 300) ?? null,
    dayBucket: today,
  });

  await db
    .update(prompts)
    .set({ viewCount: sql`${prompts.viewCount} + 1` })
    .where(eq(prompts.id, input.promptId));
}

export async function incrementCopyCount(promptId: string): Promise<void> {
  await db
    .update(prompts)
    .set({ copyCount: sql`${prompts.copyCount} + 1` })
    .where(eq(prompts.id, promptId));
}

/**
 * Recomputes trending scores: recent engagement weighted with time decay.
 * Intended to be run periodically (cron / scheduled function).
 */
export async function recomputeTrending(): Promise<number> {
  const ageDays = sql`max(1.0, (${nowSec()} - coalesce(${prompts.publishedAt}, ${prompts.createdAt})) / 86400.0)`;
  const score = sql`
    ((${prompts.viewCount} * 1.0) + (${prompts.copyCount} * 4.0) +
     (${prompts.likeCount} * 3.0) + (${prompts.favoriteCount} * 5.0))
    / (${ageDays} + 2.0)
  `;

  await db.update(prompts).set({ trendingScore: score as unknown as number });

  const top = await db
    .select({ id: prompts.id })
    .from(prompts)
    .where(publishedFilter())
    .orderBy(desc(prompts.trendingScore))
    .limit(12);

  const topIds = top.map((t) => t.id);
  await db.update(prompts).set({ isTrending: false }).where(eq(prompts.isTrending, true));
  if (topIds.length > 0) {
    await db.update(prompts).set({ isTrending: true }).where(inArray(prompts.id, topIds));
  }
  return topIds.length;
}

/* ------------------------------- Admin writes ------------------------------ */

async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  const seed = slugify(base) || `prompt-${newId().slice(0, 6).toLowerCase()}`;
  for (let i = 0; i < 40; i++) {
    const candidate = i === 0 ? seed : `${seed}-${i + 1}`;
    const rows = await db
      .select({ id: prompts.id })
      .from(prompts)
      .where(eq(prompts.slug, candidate))
      .limit(1);
    if (!rows[0] || rows[0].id === ignoreId) return candidate;
  }
  return `${seed}-${Date.now().toString(36)}`;
}

async function upsertTags(promptId: string, tagNames: string[]): Promise<string[]> {
  await db.delete(promptTags).where(eq(promptTags.promptId, promptId));
  const resolved: string[] = [];

  for (const raw of tagNames) {
    const name = raw.trim();
    if (!name) continue;
    const slug = slugify(name);
    if (!slug) continue;

    const existing = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug)).limit(1);
    let tagId = existing[0]?.id;
    if (!tagId) {
      tagId = newId();
      await db.insert(tags).values({ id: tagId, name, slug });
    }
    await db.insert(promptTags).values({ promptId, tagId }).onConflictDoNothing();
    await db
      .update(tags)
      .set({ usageCount: sql`${tags.usageCount} + 1` })
      .where(eq(tags.id, tagId));
    resolved.push(name);
  }

  return resolved;
}

function buildSearchText(input: {
  title: string;
  shortDescription: string;
  promptText: string;
  aiModel: string;
  style?: string | null;
  location?: string | null;
  mood?: string | null;
  tags: string[];
  categoryName: string;
}): string {
  return [
    input.title,
    input.shortDescription,
    input.promptText.slice(0, 1200),
    input.aiModel,
    input.style,
    input.location,
    input.mood,
    input.categoryName,
    ...input.tags,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .slice(0, 4000);
}

async function refreshCategoryCounts(categoryIds: string[]): Promise<void> {
  for (const categoryId of new Set(categoryIds.filter(Boolean))) {
    const rows = await db
      .select({ value: count() })
      .from(prompts)
      .where(and(eq(prompts.categoryId, categoryId), eq(prompts.isPublished, true)));
    await db
      .update(categories)
      .set({ promptCount: rows[0]?.value ?? 0, updatedAt: nowSec() })
      .where(eq(categories.id, categoryId));
  }
}

export async function createPrompt(input: PromptWriteInput, authorId: string) {
  const categoryRows = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .limit(1);
  const category = categoryRows[0];
  if (!category) throw AppError.badRequest('Choose a valid category');

  const id = newId();
  const slug = await uniqueSlug(input.slug || input.title);
  const publishedAt = input.isPublished ? nowSec() : null;

  await db.insert(prompts).values({
    id,
    title: input.title,
    slug,
    shortDescription: input.shortDescription,
    promptText: input.promptText,
    negativePrompt: input.negativePrompt || null,
    usageInstructions: input.usageInstructions || null,
    aiModel: input.aiModel,
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId || null,
    style: input.style || null,
    gender: input.gender || null,
    ageGroup: input.ageGroup || null,
    location: input.location || null,
    aspectRatio: input.aspectRatio || null,
    cameraStyle: input.cameraStyle || null,
    lighting: input.lighting || null,
    mood: input.mood || null,
    difficulty: input.difficulty ?? 'beginner',
    isPremium: input.isPremium ?? false,
    isFeatured: input.isFeatured ?? false,
    isTrending: input.isTrending ?? false,
    isEditorsPick: input.isEditorsPick ?? false,
    isPublished: input.isPublished ?? false,
    publishedAt,
    scheduledFor: input.scheduledFor ?? null,
    coverImageUrl: input.coverImageUrl || null,
    coverImageAlt: input.coverImageAlt || null,
    authorId,
    seoTitle: input.seoTitle || null,
    seoDescription: input.seoDescription || null,
    searchText: '',
  });

  const tagNames = await upsertTags(id, input.tags ?? []);
  await saveExampleImages(id, input.exampleImages ?? []);

  await db
    .update(prompts)
    .set({
      searchText: buildSearchText({
        title: input.title,
        shortDescription: input.shortDescription,
        promptText: input.promptText,
        aiModel: input.aiModel,
        style: input.style,
        location: input.location,
        mood: input.mood,
        tags: tagNames,
        categoryName: category.name,
      }),
    })
    .where(eq(prompts.id, id));

  await refreshCategoryCounts([input.categoryId]);
  return { id, slug };
}

export async function updatePrompt(id: string, input: PromptWriteInput) {
  const existing = await getPromptById(id);
  if (!existing) throw AppError.notFound('Prompt not found');

  const categoryRows = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .limit(1);
  const category = categoryRows[0];
  if (!category) throw AppError.badRequest('Choose a valid category');

  const slug =
    input.slug && input.slug !== existing.slug
      ? await uniqueSlug(input.slug, id)
      : existing.slug;

  const becomingPublished = input.isPublished && !existing.isPublished;
  const tagNames = await upsertTags(id, input.tags ?? []);

  await db
    .update(prompts)
    .set({
      title: input.title,
      slug,
      shortDescription: input.shortDescription,
      promptText: input.promptText,
      negativePrompt: input.negativePrompt || null,
      usageInstructions: input.usageInstructions || null,
      aiModel: input.aiModel,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId || null,
      style: input.style || null,
      gender: input.gender || null,
      ageGroup: input.ageGroup || null,
      location: input.location || null,
      aspectRatio: input.aspectRatio || null,
      cameraStyle: input.cameraStyle || null,
      lighting: input.lighting || null,
      mood: input.mood || null,
      difficulty: input.difficulty ?? existing.difficulty,
      isPremium: input.isPremium ?? false,
      isFeatured: input.isFeatured ?? false,
      isTrending: input.isTrending ?? false,
      isEditorsPick: input.isEditorsPick ?? false,
      isPublished: input.isPublished ?? false,
      publishedAt: becomingPublished ? nowSec() : existing.publishedAt,
      scheduledFor: input.scheduledFor ?? null,
      coverImageUrl: input.coverImageUrl || null,
      coverImageAlt: input.coverImageAlt || null,
      seoTitle: input.seoTitle || null,
      seoDescription: input.seoDescription || null,
      searchText: buildSearchText({
        title: input.title,
        shortDescription: input.shortDescription,
        promptText: input.promptText,
        aiModel: input.aiModel,
        style: input.style,
        location: input.location,
        mood: input.mood,
        tags: tagNames,
        categoryName: category.name,
      }),
      updatedAt: nowSec(),
    })
    .where(eq(prompts.id, id));

  if (input.exampleImages) await saveExampleImages(id, input.exampleImages);
  await refreshCategoryCounts([input.categoryId, existing.categoryId]);
  return { id, slug };
}

async function saveExampleImages(
  promptId: string,
  images: { url: string; alt?: string; width?: number; height?: number }[],
) {
  await db.delete(promptImages).where(eq(promptImages.promptId, promptId));
  if (images.length === 0) return;

  await db.insert(promptImages).values(
    images.map((image, index) => ({
      id: newId(),
      promptId,
      objectKey: image.url.split('/').pop() ?? `image-${index}`,
      url: image.url,
      thumbnailUrl: null,
      alt: image.alt ?? null,
      width: image.width ?? null,
      height: image.height ?? null,
      sortOrder: index,
    })),
  );
}

export async function setPromptPublished(id: string, published: boolean) {
  const existing = await getPromptById(id);
  if (!existing) throw AppError.notFound('Prompt not found');

  await db
    .update(prompts)
    .set({
      isPublished: published,
      publishedAt: published ? existing.publishedAt ?? nowSec() : existing.publishedAt,
      updatedAt: nowSec(),
    })
    .where(eq(prompts.id, id));

  await refreshCategoryCounts([existing.categoryId]);
  return { published };
}

export async function setPromptFlags(
  id: string,
  flags: Partial<{
    isFeatured: boolean;
    isTrending: boolean;
    isPremium: boolean;
    isEditorsPick: boolean;
  }>,
) {
  await db
    .update(prompts)
    .set({ ...flags, updatedAt: nowSec() })
    .where(eq(prompts.id, id));
}

export async function deletePrompt(id: string) {
  const existing = await getPromptById(id);
  if (!existing) throw AppError.notFound('Prompt not found');
  await db.delete(prompts).where(eq(prompts.id, id));
  await refreshCategoryCounts([existing.categoryId]);
}

/** Publishes prompts whose scheduled time has arrived. */
export async function publishScheduled(): Promise<number> {
  const due = await db
    .select({ id: prompts.id, categoryId: prompts.categoryId })
    .from(prompts)
    .where(
      and(
        eq(prompts.isPublished, false),
        sql`${prompts.scheduledFor} is not null`,
        sql`${prompts.scheduledFor} <= ${nowSec()}`,
      ),
    );

  if (due.length === 0) return 0;

  await db
    .update(prompts)
    .set({ isPublished: true, publishedAt: nowSec(), scheduledFor: null, updatedAt: nowSec() })
    .where(inArray(prompts.id, due.map((d) => d.id)));

  await refreshCategoryCounts(due.map((d) => d.categoryId));
  return due.length;
}

/* --------------------------- Admin listing helper -------------------------- */

export interface AdminPromptRow {
  id: string;
  title: string;
  slug: string;
  aiModel: string;
  categoryName: string;
  isPublished: boolean;
  isPremium: boolean;
  isTrending: boolean;
  isFeatured: boolean;
  viewCount: number;
  copyCount: number;
  likeCount: number;
  updatedAt: number;
  createdAt: number;
}

export async function adminListPrompts(options: {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: 'all' | 'published' | 'draft';
  model?: string;
  category?: string;
}): Promise<{ items: AdminPromptRow[]; total: number; page: number; pageSize: number }> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const filters: SQL[] = [];

  if (options.status === 'published') filters.push(eq(prompts.isPublished, true));
  if (options.status === 'draft') filters.push(eq(prompts.isPublished, false));
  if (options.model) filters.push(eq(prompts.aiModel, options.model));
  if (options.category) filters.push(eq(categories.slug, options.category));
  if (options.q) {
    const needle = `%${options.q.toLowerCase()}%`;
    filters.push(or(like(sql`lower(${prompts.title})`, needle), like(prompts.searchText, needle))!);
  }

  const where = filters.length > 0 ? and(...filters) : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: prompts.id,
        title: prompts.title,
        slug: prompts.slug,
        aiModel: prompts.aiModel,
        categoryName: categories.name,
        isPublished: prompts.isPublished,
        isPremium: prompts.isPremium,
        isTrending: prompts.isTrending,
        isFeatured: prompts.isFeatured,
        viewCount: prompts.viewCount,
        copyCount: prompts.copyCount,
        likeCount: prompts.likeCount,
        updatedAt: prompts.updatedAt,
        createdAt: prompts.createdAt,
      })
      .from(prompts)
      .innerJoin(categories, eq(categories.id, prompts.categoryId))
      .where(where)
      .orderBy(desc(prompts.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(prompts)
      .innerJoin(categories, eq(categories.id, prompts.categoryId))
      .where(where),
  ]);

  return { items, total: totalRows[0]?.value ?? 0, page, pageSize };
}

export async function countPublishedSince(seconds: number): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(prompts)
    .where(and(eq(prompts.isPublished, true), gt(prompts.publishedAt, seconds)));
  return rows[0]?.value ?? 0;
}
