import {
  categories,
  db,
  favorites,
  likes,
  promptImages,
  promptTags,
  promptViews,
  prompts,
  tags,
  users,
} from '@pd/db';
import { PAGE_SIZE, slugify, type PromptWriteInput, type SortOption } from '@pd/shared';
import { and, count, desc, eq, inArray, like, ne, or, sql, type SQL } from 'drizzle-orm';

import { AppError } from '../lib/errors';
import { newId } from '../lib/crypto';
import { dayBucket, nowSec } from '../lib/dates';

/**
 * Prompt reads for the API. Public listings only ever expose published prompts,
 * and a premium prompt's body is withheld unless the caller is entitled — the
 * same guarantee as the monolith, now served over HTTP.
 */

export interface PromptCard {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  aiModel: string;
  /** 'text-to-image' | 'photo-edit' — see INPUT_MODES in @pd/shared. */
  inputMode: string;
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

const cardColumns = {
  id: prompts.id,
  title: prompts.title,
  slug: prompts.slug,
  shortDescription: prompts.shortDescription,
  aiModel: prompts.aiModel,
  inputMode: prompts.inputMode,
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
    default:
      return [desc(prompts.isTrending), desc(prompts.trendingScore), desc(prompts.createdAt)];
  }
}

export interface ListQuery {
  q?: string;
  category?: string;
  model?: string;
  access?: 'all' | 'free' | 'premium';
  sort?: SortOption;
  style?: string;
  page?: number;
  pageSize?: number;
}

export interface ListResult {
  items: PromptCard[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

async function buildFilters(query: ListQuery): Promise<SQL[]> {
  const filters: SQL[] = [publishedFilter()];
  if (query.category) filters.push(eq(categories.slug, query.category));
  if (query.model) filters.push(eq(prompts.aiModel, query.model));
  if (query.access === 'free') filters.push(eq(prompts.isPremium, false));
  if (query.access === 'premium') filters.push(eq(prompts.isPremium, true));
  if (query.style) filters.push(eq(prompts.style, query.style));
  if (query.q && query.q.trim()) {
    const needle = `%${query.q.trim().toLowerCase()}%`;
    filters.push(
      or(like(prompts.searchText, needle), like(sql`lower(${prompts.title})`, needle))!,
    );
  }
  return filters;
}

export async function listPrompts(query: ListQuery): Promise<ListResult> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? PAGE_SIZE;
  const where = and(...(await buildFilters(query)));

  const [rows, totals] = await Promise.all([
    db
      .select(cardColumns)
      .from(prompts)
      .innerJoin(categories, eq(categories.id, prompts.categoryId))
      .where(where)
      .orderBy(...orderFor(query.sort ?? 'trending'))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(prompts)
      .innerJoin(categories, eq(categories.id, prompts.categoryId))
      .where(where),
  ]);

  const total = totals[0]?.value ?? 0;
  return {
    items: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    hasMore: page * pageSize < total,
  };
}

export interface PromptDetail extends PromptCard {
  promptText: string | null;
  negativePrompt: string | null;
  usageInstructions: string | null;
  location: string | null;
  cameraStyle: string | null;
  lighting: string | null;
  mood: string | null;
  ageGroup: string | null;
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
  likedByMe: boolean;
  savedByMe: boolean;
}

export async function getPromptBySlug(
  slug: string,
  options: { viewerId?: string | null; canSeePremium?: boolean; allowUnpublished?: boolean } = {},
): Promise<PromptDetail | null> {
  const rows = await db
    .select({
      ...cardColumns,
      promptText: prompts.promptText,
      negativePrompt: prompts.negativePrompt,
      usageInstructions: prompts.usageInstructions,
      location: prompts.location,
      cameraStyle: prompts.cameraStyle,
      lighting: prompts.lighting,
      mood: prompts.mood,
      ageGroup: prompts.ageGroup,
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
  if (!row || (!row.isPublished && !options.allowUnpublished)) return null;

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
      .orderBy(promptImages.sortOrder),
  ]);

  let likedByMe = false;
  let savedByMe = false;
  if (options.viewerId) {
    const [liked, saved] = await Promise.all([
      db
        .select({ p: likes.promptId })
        .from(likes)
        .where(and(eq(likes.userId, options.viewerId), eq(likes.promptId, row.id)))
        .limit(1),
      db
        .select({ p: favorites.promptId })
        .from(favorites)
        .where(and(eq(favorites.userId, options.viewerId), eq(favorites.promptId, row.id)))
        .limit(1),
    ]);
    likedByMe = liked.length > 0;
    savedByMe = saved.length > 0;
  }

  const locked = row.isPremium && !options.canSeePremium;

  return {
    ...(row as PromptCard),
    promptText: locked ? null : row.promptText,
    negativePrompt: locked ? null : row.negativePrompt,
    usageInstructions: locked ? null : row.usageInstructions,
    location: row.location,
    cameraStyle: row.cameraStyle,
    lighting: row.lighting,
    mood: row.mood,
    ageGroup: row.ageGroup,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    updatedAt: row.updatedAt,
    authorName: row.authorName,
    authorUsername: row.authorUsername,
    tags: tagRows,
    images: imageRows,
    locked,
    likedByMe,
    savedByMe,
  };
}

export async function allPublishedSlugs(): Promise<{ slug: string; updatedAt: number }[]> {
  return db
    .select({ slug: prompts.slug, updatedAt: prompts.updatedAt })
    .from(prompts)
    .where(publishedFilter())
    .orderBy(desc(prompts.updatedAt));
}

export async function getPromptById(id: string) {
  const rows = await db.select().from(prompts).where(eq(prompts.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function incrementCopyCount(promptId: string): Promise<void> {
  await db
    .update(prompts)
    .set({ copyCount: sql`${prompts.copyCount} + 1` })
    .where(eq(prompts.id, promptId));
}

export async function trendingPrompts(
  limit = 8,
  viewerId: string | null = null,
): Promise<PromptCard[]> {
  return collection([], orderFor('trending'), limit, viewerId);
}

export async function decorateViewer(cards: PromptCard[], viewerId: string | null): Promise<(PromptCard & { likedByMe?: boolean; savedByMe?: boolean })[]> {
  if (!viewerId || cards.length === 0) return cards;
  const ids = cards.map((c) => c.id);
  const [likedRows, savedRows] = await Promise.all([
    db.select({ p: likes.promptId }).from(likes).where(and(eq(likes.userId, viewerId), inArray(likes.promptId, ids))),
    db.select({ p: favorites.promptId }).from(favorites).where(and(eq(favorites.userId, viewerId), inArray(favorites.promptId, ids))),
  ]);
  const liked = new Set(likedRows.map((r) => r.p));
  const saved = new Set(savedRows.map((r) => r.p));
  return cards.map((c) => ({ ...c, likedByMe: liked.has(c.id), savedByMe: saved.has(c.id) }));
}


/* =========================== Admin writes ============================= */

export interface AdminListQuery {
  q?: string;
  category?: string;
  model?: string;
  status?: 'all' | 'published' | 'draft';
  page?: number;
  pageSize?: number;
}

/**
 * Columns for the admin listing.
 *
 * `cardColumns` omits `isPublished` because the public listing only ever returns
 * published rows, making the flag redundant there. The admin table, however,
 * renders a Published/Draft badge and a Publish/Unpublish button from it — so
 * selecting `cardColumns` here meant the field arrived undefined and every
 * prompt in the console displayed as a draft, including the forty-two that were
 * live on the site.
 */
const adminCardColumns = {
  ...cardColumns,
  isPublished: prompts.isPublished,
  scheduledFor: prompts.scheduledFor,
  updatedAt: prompts.updatedAt,
};

export interface AdminListResult extends Omit<ListResult, 'items'> {
  items: (PromptCard & {
    isPublished: boolean;
    scheduledFor: number | null;
    updatedAt: number;
  })[];
}

/** Admin listing exposes drafts and unpublished rows alongside published ones. */
export async function adminListPrompts(query: AdminListQuery): Promise<AdminListResult> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? PAGE_SIZE;
  const filters: SQL[] = [];
  if (query.category) filters.push(eq(categories.slug, query.category));
  if (query.model) filters.push(eq(prompts.aiModel, query.model));
  if (query.status === 'published') filters.push(eq(prompts.isPublished, true));
  if (query.status === 'draft') filters.push(eq(prompts.isPublished, false));
  if (query.q && query.q.trim()) {
    const needle = `%${query.q.trim().toLowerCase()}%`;
    filters.push(or(like(prompts.searchText, needle), like(sql`lower(${prompts.title})`, needle))!);
  }
  const where = filters.length ? and(...filters) : undefined;

  const [rows, totals] = await Promise.all([
    db
      .select(adminCardColumns)
      .from(prompts)
      .innerJoin(categories, eq(categories.id, prompts.categoryId))
      .where(where)
      .orderBy(desc(prompts.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(prompts)
      .innerJoin(categories, eq(categories.id, prompts.categoryId))
      .where(where),
  ]);

  const total = totals[0]?.value ?? 0;
  return {
    items: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    hasMore: page * pageSize < total,
  };
}

/** Full admin detail — no premium gating, every field returned raw. */
export async function adminGetPrompt(id: string) {
  const prompt = await getPromptById(id);
  if (!prompt) return null;
  const [tagRows, imageRows] = await Promise.all([
    db
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(promptTags)
      .innerJoin(tags, eq(tags.id, promptTags.tagId))
      .where(eq(promptTags.promptId, id)),
    db
      .select()
      .from(promptImages)
      .where(eq(promptImages.promptId, id))
      .orderBy(promptImages.sortOrder),
  ]);
  // The raw row carries every admin-editable column, including categoryId.
  return { ...prompt, tags: tagRows, images: imageRows };
}

/** Ensures a unique slug, appending -2, -3, … when a collision is found. */
async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || 'prompt';
  let candidate = root;
  let n = 1;
  for (;;) {
    const existing = await db
      .select({ id: prompts.id })
      .from(prompts)
      .where(eq(prompts.slug, candidate))
      .limit(1);
    const hit = existing[0];
    if (!hit || hit.id === excludeId) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

/** Resolves free-text tag names to tag ids, creating any that don't exist. */
async function upsertTags(names: string[]): Promise<string[]> {
  const clean = Array.from(
    new Set(names.map((n) => n.trim()).filter((n) => n.length > 0)),
  );
  const ids: string[] = [];
  for (const name of clean) {
    const slug = slugify(name);
    if (!slug) continue;
    const existing = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug)).limit(1);
    if (existing[0]) {
      ids.push(existing[0].id);
      continue;
    }
    const id = newId();
    await db.insert(tags).values({ id, name, slug });
    ids.push(id);
  }
  return ids;
}

/** Rebuilds the denormalised lowercase search haystack for a prompt. */
function buildSearchText(input: {
  title: string;
  shortDescription: string;
  promptText: string;
  tagNames: string[];
}): string {
  return [input.title, input.shortDescription, input.promptText, input.tagNames.join(' ')]
    .join(' ')
    .toLowerCase()
    .slice(0, 4000);
}

async function syncPromptTags(promptId: string, tagNames: string[]): Promise<void> {
  const tagIds = await upsertTags(tagNames);
  await db.delete(promptTags).where(eq(promptTags.promptId, promptId));
  if (tagIds.length) {
    await db.insert(promptTags).values(tagIds.map((tagId) => ({ promptId, tagId })));
  }
}

/**
 * Replaces a prompt's example-output images.
 *
 * `exampleImages` was previously accepted by `promptWriteSchema`, validated,
 * and then silently dropped — `writeColumns` never referenced it and nothing
 * else in the codebase wrote to `prompt_images`. The public prompt page has
 * always *read* that table to draw its thumbnail strip, so the feature was
 * half-built: a read path with no write path. This is the missing half.
 *
 * Replace-all rather than diff, matching `syncPromptTags`. The row count is
 * capped at eight by the schema, so the cost of rewriting them is trivial and
 * it keeps ordering honest: `sortOrder` follows the submitted array.
 *
 * `objectKey` is NOT NULL in the table but the write schema only carries a URL,
 * because an operator may legitimately paste a URL for a file uploaded earlier.
 * The key is therefore recovered from the URL path, which is exactly what
 * `uploadImage` used to build it. It exists so that a future cleanup job can
 * delete orphaned objects from R2 — nothing depends on it today.
 */
async function syncPromptImages(
  promptId: string,
  images: PromptWriteInput['exampleImages'],
): Promise<void> {
  await db.delete(promptImages).where(eq(promptImages.promptId, promptId));
  if (!images?.length) return;

  await db.insert(promptImages).values(
    images.map((image, index) => ({
      id: newId(),
      promptId,
      objectKey: objectKeyFromUrl(image.url),
      url: image.url,
      alt: image.alt ?? null,
      width: image.width ?? null,
      height: image.height ?? null,
      sortOrder: index,
    })),
  );
}

/** Best-effort recovery of an R2 object key from its public URL. */
function objectKeyFromUrl(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/+/, '') || url;
  } catch {
    return url;
  }
}

function writeColumns(input: PromptWriteInput) {
  return {
    title: input.title,
    shortDescription: input.shortDescription,
    promptText: input.promptText,
    negativePrompt: input.negativePrompt ?? null,
    usageInstructions: input.usageInstructions ?? null,
    aiModel: input.aiModel,
    inputMode: input.inputMode ?? 'text-to-image',
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId || null,
    style: input.style ?? null,
    gender: input.gender ?? null,
    ageGroup: input.ageGroup ?? null,
    location: input.location ?? null,
    aspectRatio: input.aspectRatio ?? null,
    cameraStyle: input.cameraStyle ?? null,
    lighting: input.lighting ?? null,
    mood: input.mood ?? null,
    difficulty: input.difficulty ?? 'beginner',
    isPremium: input.isPremium ?? false,
    isFeatured: input.isFeatured ?? false,
    isTrending: input.isTrending ?? false,
    isEditorsPick: input.isEditorsPick ?? false,
    coverImageUrl: input.coverImageUrl || null,
    coverImageAlt: input.coverImageAlt ?? null,
    seoTitle: input.seoTitle ?? null,
    seoDescription: input.seoDescription ?? null,
  };
}

export async function createPrompt(input: PromptWriteInput, authorId: string | null) {
  if (!input.title?.trim()) throw AppError.badRequest('Title is required');
  if (!input.promptText?.trim()) throw AppError.badRequest('Prompt text is required');
  if (!input.categoryId) throw AppError.badRequest('Category is required');

  const category = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .limit(1);
  if (!category[0]) throw AppError.badRequest('Unknown category');

  const id = newId();
  const slug = await ensureUniqueSlug(input.slug || input.title);
  const tagNames = input.tags ?? [];
  const published = input.isPublished ?? false;

  await db.insert(prompts).values({
    id,
    slug,
    ...writeColumns(input),
    isPublished: published,
    publishedAt: published ? nowSec() : null,
    scheduledFor: input.scheduledFor ?? null,
    authorId,
    searchText: buildSearchText({
      title: input.title,
      shortDescription: input.shortDescription,
      promptText: input.promptText,
      tagNames,
    }),
  });

  await syncPromptTags(id, tagNames);
  await syncPromptImages(id, input.exampleImages);
  await refreshCategoryCount(input.categoryId);
  return adminGetPrompt(id);
}

export async function updatePrompt(id: string, input: PromptWriteInput) {
  const existing = await getPromptById(id);
  if (!existing) throw AppError.notFound('Prompt not found');
  if (!input.title?.trim()) throw AppError.badRequest('Title is required');
  if (!input.categoryId) throw AppError.badRequest('Category is required');

  const slug = input.slug && input.slug !== existing.slug
    ? await ensureUniqueSlug(input.slug, id)
    : existing.slug;
  const tagNames = input.tags ?? [];
  const published = input.isPublished ?? existing.isPublished;

  await db
    .update(prompts)
    .set({
      slug,
      ...writeColumns(input),
      isPublished: published,
      publishedAt: published ? (existing.publishedAt ?? nowSec()) : existing.publishedAt,
      scheduledFor: input.scheduledFor ?? existing.scheduledFor,
      searchText: buildSearchText({
        title: input.title,
        shortDescription: input.shortDescription,
        promptText: input.promptText,
        tagNames,
      }),
      updatedAt: nowSec(),
    })
    .where(eq(prompts.id, id));

  await syncPromptTags(id, tagNames);
  await syncPromptImages(id, input.exampleImages);
  if (existing.categoryId !== input.categoryId) {
    await Promise.all([
      refreshCategoryCount(existing.categoryId),
      refreshCategoryCount(input.categoryId),
    ]);
  } else {
    await refreshCategoryCount(input.categoryId);
  }
  return adminGetPrompt(id);
}

export async function setPromptPublished(id: string, isPublished: boolean) {
  const existing = await getPromptById(id);
  if (!existing) throw AppError.notFound('Prompt not found');
  await db
    .update(prompts)
    .set({
      isPublished,
      publishedAt: isPublished ? (existing.publishedAt ?? nowSec()) : existing.publishedAt,
      updatedAt: nowSec(),
    })
    .where(eq(prompts.id, id));
  await refreshCategoryCount(existing.categoryId);
  return adminGetPrompt(id);
}

export type PromptFlag = 'isFeatured' | 'isTrending' | 'isEditorsPick' | 'isPremium';

export async function setPromptFlags(id: string, flags: Partial<Record<PromptFlag, boolean>>) {
  const existing = await getPromptById(id);
  if (!existing) throw AppError.notFound('Prompt not found');
  const patch: Record<string, unknown> = { updatedAt: nowSec() };
  for (const key of ['isFeatured', 'isTrending', 'isEditorsPick', 'isPremium'] as PromptFlag[]) {
    if (typeof flags[key] === 'boolean') patch[key] = flags[key];
  }
  await db.update(prompts).set(patch).where(eq(prompts.id, id));
  return adminGetPrompt(id);
}

export async function deletePrompt(id: string): Promise<void> {
  const existing = await getPromptById(id);
  if (!existing) throw AppError.notFound('Prompt not found');
  await db.delete(prompts).where(eq(prompts.id, id));
  await refreshCategoryCount(existing.categoryId);
}

/** Recomputes the cached published-prompt count on a category row. */
async function refreshCategoryCount(categoryId: string): Promise<void> {
  const [row] = await db
    .select({ value: count() })
    .from(prompts)
    .where(and(eq(prompts.categoryId, categoryId), eq(prompts.isPublished, true)));
  await db
    .update(categories)
    .set({ promptCount: row?.value ?? 0 })
    .where(eq(categories.id, categoryId));
}


/* ======================== Curated collections ========================== */

async function collection(
  extra: SQL[],
  order: ReturnType<typeof orderFor>,
  limit: number,
  viewerId: string | null,
): Promise<PromptCard[]> {
  const rows = await db
    .select(cardColumns)
    .from(prompts)
    .innerJoin(categories, eq(categories.id, prompts.categoryId))
    .where(and(publishedFilter(), ...extra))
    .orderBy(...order)
    .limit(limit);
  return decorateViewer(rows, viewerId);
}

export async function latestPrompts(limit = 8, viewerId: string | null = null) {
  return collection([], orderFor('newest'), limit, viewerId);
}

export async function featuredPrompts(limit = 6, viewerId: string | null = null) {
  return collection([eq(prompts.isFeatured, true)], orderFor('trending'), limit, viewerId);
}

export async function premiumShowcase(limit = 4, viewerId: string | null = null) {
  return collection([eq(prompts.isPremium, true)], orderFor('trending'), limit, viewerId);
}

export interface RelatedGroups {
  related: PromptCard[];
  sameCategory: PromptCard[];
  sameModel: PromptCard[];
  trending: PromptCard[];
}

/** Four recommendation rails for a prompt detail page, in one round trip. */
export async function relatedPrompts(
  prompt: { id: string; categorySlug: string; aiModel: string; style: string | null },
  viewerId: string | null = null,
): Promise<RelatedGroups> {
  const exclude = ne(prompts.id, prompt.id);
  const order = [desc(prompts.trendingScore), desc(prompts.viewCount)];

  const fetchGroup = async (extra: SQL[], limit: number) => {
    const rows = await db
      .select(cardColumns)
      .from(prompts)
      .innerJoin(categories, eq(categories.id, prompts.categoryId))
      .where(and(publishedFilter(), exclude, ...extra))
      .orderBy(...order)
      .limit(limit);
    return decorateViewer(rows, viewerId);
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

/* ============================== Counters =============================== */

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

/**
 * Recomputes the rolling popularity score and re-picks the trending set.
 * Run from the scheduled worker, never from a user request.
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

/** Publishes any prompt whose scheduled time has arrived. */
export async function publishScheduled(): Promise<number> {
  const now = nowSec();
  const due = await db
    .select({ id: prompts.id })
    .from(prompts)
    .where(
      and(
        eq(prompts.isPublished, false),
        sql`${prompts.scheduledFor} is not null`,
        sql`${prompts.scheduledFor} <= ${now}`,
      ),
    );

  if (due.length === 0) return 0;
  await db
    .update(prompts)
    .set({ isPublished: true, publishedAt: now, updatedAt: now })
    .where(
      inArray(
        prompts.id,
        due.map((d) => d.id),
      ),
    );
  return due.length;
}

export async function countPublishedSince(seconds: number): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(prompts)
    .where(and(eq(prompts.isPublished, true), sql`${prompts.publishedAt} >= ${seconds}`));
  return rows[0]?.value ?? 0;
}
