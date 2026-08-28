import { categories, db, favorites, likes, promptImages, promptTags, prompts, tags, users } from '@pd/db';
import { PAGE_SIZE, slugify, type PromptWriteInput, type SortOption } from '@pd/shared';
import { and, count, desc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';

import { AppError } from '../lib/errors';
import { newId } from '../lib/crypto';
import { nowSec } from '../lib/dates';

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
  categoryName: string;
  categorySlug: string;
  style: string | null;
  aspectRatio: string | null;
  isPremium: boolean;
  isTrending: boolean;
  isFeatured: boolean;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  viewCount: number;
  copyCount: number;
  likeCount: number;
  createdAt: number;
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
  isPremium: prompts.isPremium,
  isTrending: prompts.isTrending,
  isFeatured: prompts.isFeatured,
  coverImageUrl: prompts.coverImageUrl,
  coverImageAlt: prompts.coverImageAlt,
  viewCount: prompts.viewCount,
  copyCount: prompts.copyCount,
  likeCount: prompts.likeCount,
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
  gender: string | null;
  ageGroup: string | null;
  difficulty: string;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: number;
  publishedAt: number | null;
  authorName: string | null;
  tags: { name: string; slug: string }[];
  images: { id: string; url: string; alt: string | null }[];
  locked: boolean;
  likedByMe: boolean;
  savedByMe: boolean;
}

export async function getPromptBySlug(
  slug: string,
  options: { viewerId?: string | null; canSeePremium?: boolean } = {},
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
      gender: prompts.gender,
      ageGroup: prompts.ageGroup,
      difficulty: prompts.difficulty,
      seoTitle: prompts.seoTitle,
      seoDescription: prompts.seoDescription,
      updatedAt: prompts.updatedAt,
      publishedAt: prompts.publishedAt,
      isPublished: prompts.isPublished,
      authorName: users.name,
    })
    .from(prompts)
    .innerJoin(categories, eq(categories.id, prompts.categoryId))
    .leftJoin(users, eq(users.id, prompts.authorId))
    .where(eq(prompts.slug, slug))
    .limit(1);

  const row = rows[0];
  if (!row || !row.isPublished) return null;

  const [tagRows, imageRows] = await Promise.all([
    db
      .select({ name: tags.name, slug: tags.slug })
      .from(promptTags)
      .innerJoin(tags, eq(tags.id, promptTags.tagId))
      .where(eq(promptTags.promptId, row.id)),
    db
      .select({ id: promptImages.id, url: promptImages.url, alt: promptImages.alt })
      .from(promptImages)
      .where(eq(promptImages.promptId, row.id)),
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
    gender: row.gender,
    ageGroup: row.ageGroup,
    difficulty: row.difficulty,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
    authorName: row.authorName,
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

export async function trendingPrompts(limit = 8): Promise<PromptCard[]> {
  return (await listPrompts({ sort: 'trending', pageSize: limit })).items;
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

/** Admin listing exposes drafts and unpublished rows alongside published ones. */
export async function adminListPrompts(query: AdminListQuery): Promise<ListResult> {
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
      .select(cardColumns)
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

function writeColumns(input: PromptWriteInput) {
  return {
    title: input.title,
    shortDescription: input.shortDescription,
    promptText: input.promptText,
    negativePrompt: input.negativePrompt ?? null,
    usageInstructions: input.usageInstructions ?? null,
    aiModel: input.aiModel,
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
