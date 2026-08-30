import { apiRequest, query } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import { AppError } from '@/lib/api';
import type { PromptListQuery, PromptWriteInput } from '@/lib/validation';

/**
 * Prompt reads and writes, served by the API.
 *
 * Public listings never include a prompt body, and a premium prompt's body is
 * withheld by the API unless the caller is entitled — so paid content never
 * reaches the HTML of an unauthorised page.
 */

export interface PromptCardData {
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

export interface PromptListResult {
  items: PromptCardData[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

export interface RelatedGroups {
  related: PromptCardData[];
  sameCategory: PromptCardData[];
  sameModel: PromptCardData[];
  trending: PromptCardData[];
}

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

async function token(): Promise<string> {
  const value = await getAccessToken();
  if (!value) throw AppError.unauthorized();
  return value;
}

/* --------------------------------- Reads ---------------------------------- */

export async function listPrompts(
  q: Partial<PromptListQuery> = {},
  _viewerId?: string | null,
): Promise<PromptListResult> {
  return apiRequest<PromptListResult>(
    `/v1/prompts${query({
      q: q.q,
      category: q.category,
      model: q.model,
      access: q.access,
      sort: q.sort,
      style: q.style,
      gender: q.gender,
      aspect: q.aspect,
      featured: q.featured ? 1 : undefined,
      page: q.page,
      pageSize: q.pageSize,
    })}`,
    { token: await getAccessToken() },
  );
}

interface CollectionsResponse {
  trending: PromptCardData[];
  latest: PromptCardData[];
  featured: PromptCardData[];
  premium: PromptCardData[];
}

/**
 * The four home-page rails come from one endpoint, so a page that renders all
 * of them costs a single request.
 */
async function collections(sizes: {
  trending?: number;
  latest?: number;
  featured?: number;
  premium?: number;
}): Promise<CollectionsResponse> {
  return apiRequest<CollectionsResponse>(`/v1/prompts/collections${query(sizes)}`, {
    token: await getAccessToken(),
  });
}

export async function trendingPrompts(
  limit = 8,
  _viewerId?: string | null,
): Promise<PromptCardData[]> {
  return (await collections({ trending: limit })).trending;
}

export async function latestPrompts(
  limit = 8,
  _viewerId?: string | null,
): Promise<PromptCardData[]> {
  return (await collections({ latest: limit })).latest;
}

export async function featuredPrompts(
  limit = 6,
  _viewerId?: string | null,
): Promise<PromptCardData[]> {
  return (await collections({ featured: limit })).featured;
}

export async function premiumShowcase(
  limit = 4,
  _viewerId?: string | null,
): Promise<PromptCardData[]> {
  return (await collections({ premium: limit })).premium;
}

export async function getPromptBySlug(
  slug: string,
  _options: { viewerId?: string | null; canSeePremium?: boolean; allowUnpublished?: boolean } = {},
): Promise<PromptDetailData | null> {
  // Entitlement is resolved by the API from the bearer token, never from the
  // caller-supplied `canSeePremium` hint.
  return apiRequest<PromptDetailData | null>(`/v1/prompts/${encodeURIComponent(slug)}`, {
    token: await getAccessToken(),
    allowNotFound: true,
  });
}

export async function relatedPrompts(
  prompt: Pick<PromptDetailData, 'id' | 'categorySlug' | 'aiModel' | 'style'> & { slug?: string },
  _viewerId?: string | null,
): Promise<RelatedGroups> {
  const slug = prompt.slug ?? prompt.id;
  return apiRequest<RelatedGroups>(`/v1/prompts/${encodeURIComponent(slug)}/related`, {
    token: await getAccessToken(),
  });
}

export async function allPromptSlugs(): Promise<{ slug: string; updatedAt: number }[]> {
  const data = await apiRequest<{ slugs: { slug: string; updatedAt: number }[] }>(
    '/v1/prompts/sitemap',
    { revalidate: 600 },
  );
  return data.slugs;
}

/**
 * Admin single-prompt read. Returns the raw row, so it includes drafts, every
 * editable column (`categoryId`, `scheduledFor`, …) and the resolved tag list.
 */
export interface AdminPromptDetail {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  promptText: string;
  negativePrompt: string | null;
  usageInstructions: string | null;
  aiModel: string;
  inputMode: string;
  categoryId: string;
  subcategoryId: string | null;
  style: string | null;
  gender: string | null;
  ageGroup: string | null;
  location: string | null;
  aspectRatio: string | null;
  cameraStyle: string | null;
  lighting: string | null;
  mood: string | null;
  difficulty: string;
  isPremium: boolean;
  isFeatured: boolean;
  isTrending: boolean;
  isEditorsPick: boolean;
  isPublished: boolean;
  publishedAt: number | null;
  scheduledFor: number | null;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  viewCount: number;
  copyCount: number;
  likeCount: number;
  favoriteCount: number;
  createdAt: number;
  updatedAt: number;
  tags: { id: string; name: string; slug: string }[];
  images: {
    id: string;
    url: string;
    thumbnailUrl: string | null;
    alt: string | null;
    width: number | null;
    height: number | null;
  }[];
}

export async function getPromptById(id: string): Promise<AdminPromptDetail | null> {
  return apiRequest<AdminPromptDetail | null>(`/v1/admin/prompts/${encodeURIComponent(id)}`, {
    token: await token(),
    allowNotFound: true,
  });
}

/* ------------------------------- Counters --------------------------------- */

export async function recordView(input: {
  promptId: string;
  userId?: string | null;
  visitorHash?: string | null;
  referrer?: string | null;
}): Promise<void> {
  try {
    await apiRequest('/v1/prompts/view', {
      method: 'POST',
      token: await getAccessToken(),
      body: { promptId: input.promptId },
    });
  } catch {
    // A view counter must never break a page render.
  }
}

/* ------------------------------ Admin writes ------------------------------ */

export async function adminListPrompts(options: {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: 'all' | 'published' | 'draft';
  model?: string;
  category?: string;
}): Promise<{ items: AdminPromptRow[]; total: number; page: number; pageSize: number }> {
  return apiRequest(
    `/v1/admin/prompts${query({
      page: options.page,
      pageSize: options.pageSize,
      q: options.q,
      status: options.status,
      model: options.model,
      category: options.category,
    })}`,
    { token: await token() },
  );
}

export async function createPrompt(input: PromptWriteInput, _authorId: string) {
  return apiRequest<PromptDetailData>('/v1/admin/prompts', {
    method: 'POST',
    token: await token(),
    body: input,
  });
}

export async function updatePrompt(id: string, input: PromptWriteInput) {
  return apiRequest<PromptDetailData>(`/v1/admin/prompts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    token: await token(),
    body: input,
  });
}

export async function setPromptPublished(
  id: string,
  published: boolean,
): Promise<{ published: boolean }> {
  await apiRequest(`/v1/admin/prompts/${encodeURIComponent(id)}/publish`, {
    method: 'PATCH',
    token: await token(),
    body: { isPublished: published },
  });
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
  return apiRequest<PromptDetailData>(`/v1/admin/prompts/${encodeURIComponent(id)}/flags`, {
    method: 'PATCH',
    token: await token(),
    body: flags,
  });
}

export async function deletePrompt(id: string): Promise<void> {
  await apiRequest(`/v1/admin/prompts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token: await token(),
  });
}

/* ---------------------------- Maintenance jobs ---------------------------- */

async function runMaintenance(): Promise<{
  published: number;
  trending: number;
  expired: number;
  reminded: number;
}> {
  const { env } = await import('@/lib/env');
  return apiRequest('/v1/cron/maintenance', {
    method: 'POST',
    headers: { 'x-cron-secret': env().CRON_SECRET ?? '' },
  });
}

export async function recomputeTrending(): Promise<number> {
  return (await runMaintenance()).trending;
}

export async function publishScheduled(): Promise<number> {
  return (await runMaintenance()).published;
}
