import { apiRequest, query } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import { AppError } from '@/lib/api';

/** Blog articles, served by the API. */

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

export interface ArticleDetail extends ArticleCard {
  content: string;
  seoTitle: string | null;
  seoDescription: string | null;
  keywords: string | null;
  categoryId: string | null;
  updatedAt: number;
  related: ArticleCard[];
}

export interface AdminArticleRow extends ArticleCard {
  isPublished: boolean;
  updatedAt: number;
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

async function token(): Promise<string> {
  const value = await getAccessToken();
  if (!value) throw AppError.unauthorized();
  return value;
}

/* --------------------------------- Reads ---------------------------------- */

export async function listArticles(
  options: { limit?: number; publishedOnly?: boolean } = {},
): Promise<ArticleCard[]> {
  const data = await apiRequest<{ items: ArticleCard[] }>(
    `/v1/catalog/articles${query({ pageSize: options.limit })}`,
    { revalidate: 300, tags: ['articles'] },
  );
  return data.items;
}

export async function getArticleBySlug(
  slug: string,
  _allowUnpublished = false,
): Promise<ArticleDetail | null> {
  return apiRequest<ArticleDetail | null>(`/v1/catalog/articles/${encodeURIComponent(slug)}`, {
    revalidate: 300,
    tags: ['articles'],
    allowNotFound: true,
  });
}

/**
 * Related articles are returned alongside the detail payload, so this only
 * issues a request when called standalone.
 */
export async function relatedArticles(
  slug: string,
  _categoryId: string | null,
  limit = 3,
): Promise<ArticleCard[]> {
  const article = await getArticleBySlug(slug);
  return (article?.related ?? []).slice(0, limit);
}

export async function allArticleSlugs(): Promise<{ slug: string; updatedAt: number }[]> {
  const data = await apiRequest<{ slugs: { slug: string; updatedAt: number }[] }>(
    '/v1/catalog/articles/slugs',
    { revalidate: 300 },
  );
  return data.slugs;
}

export async function incrementArticleViews(id: string): Promise<void> {
  try {
    await apiRequest(`/v1/catalog/articles/${encodeURIComponent(id)}/view`, { method: 'POST' });
  } catch {
    // A view counter must never break the page.
  }
}

/* --------------------------------- Writes --------------------------------- */

export async function adminListArticles(): Promise<AdminArticleRow[]> {
  const data = await apiRequest<{ items: AdminArticleRow[] }>('/v1/admin/articles', {
    token: await token(),
  });
  return data.items;
}

export async function createArticle(
  input: ArticleWriteInput,
  _authorId: string,
): Promise<AdminArticleRow> {
  return apiRequest<AdminArticleRow>('/v1/admin/articles', {
    method: 'POST',
    token: await token(),
    body: input,
  });
}

export async function updateArticle(
  id: string,
  input: ArticleWriteInput,
): Promise<AdminArticleRow> {
  return apiRequest<AdminArticleRow>(`/v1/admin/articles/${encodeURIComponent(id)}`, {
    method: 'PUT',
    token: await token(),
    body: input,
  });
}

export async function deleteArticle(id: string): Promise<void> {
  await apiRequest(`/v1/admin/articles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token: await token(),
  });
}

export async function getArticleById(id: string): Promise<AdminArticleRow & { content: string }> {
  return apiRequest(`/v1/admin/articles/${encodeURIComponent(id)}`, { token: await token() });
}
