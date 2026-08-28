import { and, desc, eq, ne, sql } from 'drizzle-orm';

import { db } from '@/db';
import { articles, categories, users } from '@/db/schema';
import { AppError } from '@/lib/api';
import { nowSec } from '@/lib/dates';
import { newId } from '@/lib/id';
import { readingMinutes, slugify } from '@/lib/utils';

/** SEO content system: original long-form articles managed from the admin CMS. */

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

export async function listArticles(options: { limit?: number; publishedOnly?: boolean } = {}) {
  return db
    .select(cardColumns)
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.categoryId))
    .leftJoin(users, eq(users.id, articles.authorId))
    .where(options.publishedOnly === false ? undefined : eq(articles.isPublished, true))
    .orderBy(desc(articles.publishedAt), desc(articles.createdAt))
    .limit(options.limit ?? 24);
}

export async function getArticleBySlug(slug: string, allowUnpublished = false) {
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
  if (!row) return null;
  if (!row.isPublished && !allowUnpublished) return null;
  return row;
}

export async function relatedArticles(slug: string, categoryId: string | null, limit = 3) {
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

export async function incrementArticleViews(id: string) {
  await db
    .update(articles)
    .set({ viewCount: sql`${articles.viewCount} + 1` })
    .where(eq(articles.id, id));
}

export async function allArticleSlugs(): Promise<{ slug: string; updatedAt: number }[]> {
  return db
    .select({ slug: articles.slug, updatedAt: articles.updatedAt })
    .from(articles)
    .where(eq(articles.isPublished, true));
}

/* -------------------------------- Admin CRUD ------------------------------- */

async function uniqueArticleSlug(base: string, ignoreId?: string): Promise<string> {
  const seed = slugify(base) || `article-${newId().slice(0, 5).toLowerCase()}`;
  for (let i = 0; i < 40; i++) {
    const candidate = i === 0 ? seed : `${seed}-${i + 1}`;
    const rows = await db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.slug, candidate))
      .limit(1);
    if (!rows[0] || rows[0].id === ignoreId) return candidate;
  }
  return `${seed}-${Date.now().toString(36)}`;
}

export interface ArticleWriteInput {
  title: string;
  slug?: string;
  excerpt?: string;
  content: string;
  featuredImageUrl?: string;
  categoryId?: string;
  seoTitle?: string;
  seoDescription?: string;
  keywords?: string;
  isPublished: boolean;
}

export async function createArticle(input: ArticleWriteInput, authorId: string) {
  const id = newId();
  const slug = await uniqueArticleSlug(input.slug || input.title);

  await db.insert(articles).values({
    id,
    title: input.title,
    slug,
    excerpt: input.excerpt || null,
    content: input.content,
    featuredImageUrl: input.featuredImageUrl || null,
    categoryId: input.categoryId || null,
    seoTitle: input.seoTitle || null,
    seoDescription: input.seoDescription || null,
    keywords: input.keywords || null,
    authorId,
    isPublished: input.isPublished,
    publishedAt: input.isPublished ? nowSec() : null,
    readingMinutes: readingMinutes(input.content),
  });

  return { id, slug };
}

export async function updateArticle(id: string, input: ArticleWriteInput) {
  const rows = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  const existing = rows[0];
  if (!existing) throw AppError.notFound('Article not found');

  const slug =
    input.slug && input.slug !== existing.slug
      ? await uniqueArticleSlug(input.slug, id)
      : existing.slug;

  await db
    .update(articles)
    .set({
      title: input.title,
      slug,
      excerpt: input.excerpt || null,
      content: input.content,
      featuredImageUrl: input.featuredImageUrl || null,
      categoryId: input.categoryId || null,
      seoTitle: input.seoTitle || null,
      seoDescription: input.seoDescription || null,
      keywords: input.keywords || null,
      isPublished: input.isPublished,
      publishedAt: input.isPublished ? existing.publishedAt ?? nowSec() : existing.publishedAt,
      readingMinutes: readingMinutes(input.content),
      updatedAt: nowSec(),
    })
    .where(eq(articles.id, id));

  return { id, slug };
}

export async function deleteArticle(id: string) {
  await db.delete(articles).where(eq(articles.id, id));
}

export async function adminListArticles() {
  return db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      isPublished: articles.isPublished,
      viewCount: articles.viewCount,
      publishedAt: articles.publishedAt,
      updatedAt: articles.updatedAt,
      categoryName: categories.name,
    })
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.categoryId))
    .orderBy(desc(articles.updatedAt));
}
