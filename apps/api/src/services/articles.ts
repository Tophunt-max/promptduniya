import { articles, categories, db, users } from '@pd/db';
import { readingMinutes, slugify } from '@pd/shared';
import { and, count, desc, eq, like, ne, or, sql } from 'drizzle-orm';

import { AppError } from '../lib/errors';
import { newId } from '../lib/crypto';
import { nowSec } from '../lib/dates';

/** Blog / articles: public reads plus admin CRUD, mirroring the monolith. */

export interface ArticleCard {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  featuredImageUrl: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  authorName: string | null;
  publishedAt: number | null;
  readingMinutes: number;
  viewCount: number;
}

const cardColumns = {
  id: articles.id,
  title: articles.title,
  slug: articles.slug,
  excerpt: articles.excerpt,
  featuredImageUrl: articles.featuredImageUrl,
  categoryName: categories.name,
  categorySlug: categories.slug,
  authorName: users.name,
  publishedAt: articles.publishedAt,
  readingMinutes: articles.readingMinutes,
  viewCount: articles.viewCount,
};

export async function listArticles(options: { page?: number; pageSize?: number } = {}) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 12;
  const where = eq(articles.isPublished, true);
  const [rows, totals] = await Promise.all([
    db
      .select(cardColumns)
      .from(articles)
      .leftJoin(categories, eq(categories.id, articles.categoryId))
      .leftJoin(users, eq(users.id, articles.authorId))
      .where(where)
      .orderBy(desc(articles.publishedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ v: count() }).from(articles).where(where),
  ]);
  const total = totals[0]?.v ?? 0;
  return {
    items: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getArticleBySlug(slug: string) {
  const rows = await db
    .select({
      ...cardColumns,
      content: articles.content,
      seoTitle: articles.seoTitle,
      seoDescription: articles.seoDescription,
      keywords: articles.keywords,
      isPublished: articles.isPublished,
      updatedAt: articles.updatedAt,
      categoryId: articles.categoryId,
    })
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.categoryId))
    .leftJoin(users, eq(users.id, articles.authorId))
    .where(eq(articles.slug, slug))
    .limit(1);
  const row = rows[0];
  if (!row || !row.isPublished) return null;
  return row;
}

/** Same-category articles, excluding the one being read. */
export async function relatedArticles(
  slug: string,
  categoryId: string | null,
  limit = 3,
): Promise<ArticleCard[]> {
  return db
    .select(cardColumns)
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.categoryId))
    .leftJoin(users, eq(users.id, articles.authorId))
    .where(
      and(
        eq(articles.isPublished, true),
        ne(articles.slug, slug),
        categoryId ? eq(articles.categoryId, categoryId) : undefined,
      ),
    )
    .orderBy(desc(articles.publishedAt))
    .limit(limit);
}

export async function allArticleSlugs(): Promise<{ slug: string; updatedAt: number }[]> {
  return db
    .select({ slug: articles.slug, updatedAt: articles.updatedAt })
    .from(articles)
    .where(eq(articles.isPublished, true))
    .orderBy(desc(articles.updatedAt));
}

export async function incrementArticleViews(id: string): Promise<void> {
  await db
    .update(articles)
    .set({ viewCount: sql`${articles.viewCount} + 1` })
    .where(eq(articles.id, id));
}

/* =========================== Admin writes ============================= */

export interface ArticleWriteInput {
  title: string;
  slug?: string;
  excerpt?: string | null;
  content: string;
  featuredImageUrl?: string | null;
  categoryId?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  keywords?: string | null;
  isPublished?: boolean;
  publishedAt?: number | null;
}

export async function adminListArticles(query: {
  q?: string;
  status?: 'all' | 'published' | 'draft';
  page?: number;
  pageSize?: number;
}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  const filters = [];
  if (query.status === 'published') filters.push(eq(articles.isPublished, true));
  if (query.status === 'draft') filters.push(eq(articles.isPublished, false));
  if (query.q && query.q.trim()) {
    const needle = `%${query.q.trim().toLowerCase()}%`;
    filters.push(or(like(sql`lower(${articles.title})`, needle), like(articles.slug, needle))!);
  }
  const where = filters.length ? and(...filters) : undefined;
  const [rows, totals] = await Promise.all([
    db
      .select({ ...cardColumns, isPublished: articles.isPublished, updatedAt: articles.updatedAt })
      .from(articles)
      .leftJoin(categories, eq(categories.id, articles.categoryId))
      .leftJoin(users, eq(users.id, articles.authorId))
      .where(where)
      .orderBy(desc(articles.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ v: count() }).from(articles).where(where),
  ]);
  return { items: rows, total: totals[0]?.v ?? 0, page, pageSize };
}

export async function getArticleById(id: string) {
  const rows = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  return rows[0] ?? null;
}

async function ensureUniqueArticleSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || 'article';
  let candidate = root;
  let n = 1;
  for (;;) {
    const existing = await db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.slug, candidate))
      .limit(1);
    const hit = existing[0];
    if (!hit || hit.id === excludeId) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

export async function createArticle(input: ArticleWriteInput, authorId: string | null) {
  if (!input.title?.trim()) throw AppError.badRequest('Title is required');
  if (!input.content?.trim()) throw AppError.badRequest('Content is required');
  const id = newId();
  const slug = await ensureUniqueArticleSlug(input.slug || input.title);
  const published = input.isPublished ?? false;
  await db.insert(articles).values({
    id,
    title: input.title,
    slug,
    excerpt: input.excerpt ?? null,
    content: input.content,
    featuredImageUrl: input.featuredImageUrl ?? null,
    categoryId: input.categoryId ?? null,
    seoTitle: input.seoTitle ?? null,
    seoDescription: input.seoDescription ?? null,
    keywords: input.keywords ?? null,
    authorId,
    isPublished: published,
    publishedAt: published ? (input.publishedAt ?? nowSec()) : (input.publishedAt ?? null),
    readingMinutes: readingMinutes(input.content),
  });
  return getArticleById(id);
}

export async function updateArticle(id: string, input: ArticleWriteInput) {
  const existing = await getArticleById(id);
  if (!existing) throw AppError.notFound('Article not found');
  if (!input.title?.trim()) throw AppError.badRequest('Title is required');
  const slug = input.slug && input.slug !== existing.slug
    ? await ensureUniqueArticleSlug(input.slug, id)
    : existing.slug;
  const published = input.isPublished ?? existing.isPublished;
  await db
    .update(articles)
    .set({
      title: input.title,
      slug,
      excerpt: input.excerpt ?? null,
      content: input.content ?? existing.content,
      featuredImageUrl: input.featuredImageUrl ?? null,
      categoryId: input.categoryId ?? null,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      keywords: input.keywords ?? null,
      isPublished: published,
      publishedAt: published
        ? (existing.publishedAt ?? input.publishedAt ?? nowSec())
        : (input.publishedAt ?? existing.publishedAt),
      readingMinutes: input.content ? readingMinutes(input.content) : existing.readingMinutes,
      updatedAt: nowSec(),
    })
    .where(eq(articles.id, id));
  return getArticleById(id);
}

export async function deleteArticle(id: string): Promise<void> {
  const existing = await getArticleById(id);
  if (!existing) throw AppError.notFound('Article not found');
  await db.delete(articles).where(eq(articles.id, id));
}
