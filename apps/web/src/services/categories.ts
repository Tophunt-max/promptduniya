import { apiRequest, query } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import { AppError } from '@/lib/api';

/** Category and tag reads/writes, served by the API. */

export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  accent: string;
  coverImageUrl: string | null;
  promptCount: number;
  isFeatured: boolean;
  sortOrder: number;
}

export interface CategoryDetail extends CategorySummary {
  parentId: string | null;
  isActive: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: number;
}

export interface AdminCategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  accent: string;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  promptCount: number;
  updatedAt: number;
}

export interface CategoryWriteInput {
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  accent?: string;
  coverImageUrl?: string;
  parentId?: string;
  sortOrder?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  seoTitle?: string;
  seoDescription?: string;
}

async function token(): Promise<string> {
  const value = await getAccessToken();
  if (!value) throw AppError.unauthorized();
  return value;
}

/* --------------------------------- Reads ---------------------------------- */

// Categories change rarely and are read on nearly every page, so they are
// cached at the edge and revalidated on a short interval.
const CATEGORY_REVALIDATE = 300;

export async function listCategories(
  options: { activeOnly?: boolean } = {},
): Promise<CategorySummary[]> {
  if (options.activeOnly === false) {
    // The admin listing omits cover images; fill them so the shape matches.
    const rows = await adminListCategories();
    return rows.map((row) => ({ ...row, coverImageUrl: null }));
  }
  const data = await apiRequest<{ items: CategorySummary[] }>('/v1/catalog/categories', {
    revalidate: CATEGORY_REVALIDATE,
    tags: ['categories'],
  });
  return data.items;
}

export async function featuredCategories(limit = 12): Promise<CategorySummary[]> {
  const data = await apiRequest<{ items: CategorySummary[] }>(
    `/v1/catalog/categories${query({ featured: 1 })}`,
    { revalidate: CATEGORY_REVALIDATE, tags: ['categories'] },
  );
  return data.items.slice(0, limit);
}

export async function getCategoryBySlug(slug: string): Promise<CategoryDetail | null> {
  return apiRequest<CategoryDetail | null>(
    `/v1/catalog/categories/${encodeURIComponent(slug)}`,
    { revalidate: CATEGORY_REVALIDATE, tags: ['categories'], allowNotFound: true },
  );
}

export async function subcategories(parentId: string): Promise<CategorySummary[]> {
  const data = await apiRequest<{ items: CategorySummary[] }>(
    `/v1/catalog/categories/${encodeURIComponent(parentId)}/subcategories`,
    { revalidate: CATEGORY_REVALIDATE, tags: ['categories'] },
  );
  return data.items;
}

export async function allCategorySlugs(): Promise<{ slug: string; updatedAt: number }[]> {
  const data = await apiRequest<{ slugs: { slug: string; updatedAt: number }[] }>(
    '/v1/catalog/categories/slugs',
    { revalidate: CATEGORY_REVALIDATE },
  );
  return data.slugs;
}

export interface TagRow {
  id: string;
  name: string;
  slug: string;
  usageCount: number;
}

export async function listTags(limit = 60): Promise<TagRow[]> {
  const data = await apiRequest<{ items: TagRow[] }>(
    `/v1/catalog/tags${query({ all: 1, limit })}`,
    { revalidate: CATEGORY_REVALIDATE },
  );
  return data.items;
}

export async function popularTags(limit = 18): Promise<{ name: string; slug: string }[]> {
  const data = await apiRequest<{ items: { name: string; slug: string }[] }>('/v1/catalog/tags', {
    revalidate: CATEGORY_REVALIDATE,
  });
  return data.items.slice(0, limit);
}

/* --------------------------------- Writes --------------------------------- */

export async function adminListCategories(): Promise<AdminCategoryRow[]> {
  const data = await apiRequest<{ items: AdminCategoryRow[] }>('/v1/admin/categories', {
    token: await token(),
  });
  return data.items;
}

export async function createCategory(input: CategoryWriteInput): Promise<AdminCategoryRow> {
  return apiRequest<AdminCategoryRow>('/v1/admin/categories', {
    method: 'POST',
    token: await token(),
    body: input,
  });
}

export async function updateCategory(
  id: string,
  input: CategoryWriteInput,
): Promise<AdminCategoryRow> {
  return apiRequest<AdminCategoryRow>(`/v1/admin/categories/${encodeURIComponent(id)}`, {
    method: 'PUT',
    token: await token(),
    body: input,
  });
}

export async function deleteCategory(id: string): Promise<void> {
  await apiRequest(`/v1/admin/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token: await token(),
  });
}
