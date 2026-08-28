import { apiRequest, query } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import { AppError } from '@/lib/api';

/**
 * Analytics, recorded and aggregated by the API.
 *
 * Tracking is fire-and-forget: a failed beacon must never surface to the
 * visitor, so the write helpers swallow errors. The dashboard aggregates come
 * from a single admin endpoint to keep the admin page to one round trip.
 */

export interface DailySeries {
  labels: string[];
  values: number[];
}

const EMPTY_SERIES: DailySeries = { labels: [], values: [] };

/* -------------------------------- Tracking -------------------------------- */

export async function trackPageView(input: {
  path: string;
  userId?: string | null;
  visitorHash?: string | null;
  referrer?: string | null;
}): Promise<void> {
  try {
    await apiRequest('/v1/catalog/events', {
      method: 'POST',
      token: await getAccessToken(),
      body: { name: 'page_view', path: input.path },
    });
  } catch {
    // Analytics must never break a request.
  }
}

export async function trackEvent(input: {
  name: string;
  userId?: string | null;
  visitorHash?: string | null;
  props?: Record<string, unknown>;
}): Promise<void> {
  try {
    await apiRequest('/v1/catalog/events', {
      method: 'POST',
      token: await getAccessToken(),
      body: { name: input.name, props: input.props },
    });
  } catch {
    /* ignored by design */
  }
}

/* ------------------------------- Aggregates ------------------------------- */

export interface PlatformStats {
  totalUsers: number;
  newUsers7d: number;
  activeUsers30d: number;
  premiumUsers: number;
  mrrMinor: number;
  totalRevenueMinor: number;
  successfulPayments: number;
  failedPayments: number;
  totalPrompts: number;
  publishedPrompts: number;
  premiumPrompts: number;
  promptViews: number;
  promptCopies: number;
  totalLikes: number;
  totalFavorites: number;
  generatorRuns: number;
}

export interface TopPromptRow {
  id: string;
  title: string;
  slug: string;
  views: number;
  copies: number;
  likes: number;
}

export interface TopSearchRow {
  term: string;
  hits: number;
}

export interface TopCategoryRow {
  id: string;
  name: string;
  slug: string;
  promptCount: number;
}

interface SeriesResponse {
  visitors: DailySeries;
  promptViews: DailySeries;
  promptCopies: DailySeries;
  generatorUsage: DailySeries;
  signups: DailySeries;
  revenue: DailySeries;
  conversions: DailySeries;
  topPrompts: TopPromptRow[];
  topSearches: TopSearchRow[];
  topCategories: TopCategoryRow[];
}

async function adminToken(): Promise<string> {
  const value = await getAccessToken();
  if (!value) throw AppError.unauthorized();
  return value;
}

/**
 * All dashboard series in one call, memoised per `days` value so a page that
 * renders seven charts still issues a single request.
 */
const seriesCache = new Map<number, Promise<SeriesResponse>>();

function allSeries(days: number): Promise<SeriesResponse> {
  const existing = seriesCache.get(days);
  if (existing) return existing;

  const request = (async () => {
    try {
      return await apiRequest<SeriesResponse>(`/v1/admin/stats/series${query({ days })}`, {
        token: await adminToken(),
      });
    } catch (error) {
      console.error('[analytics] series lookup failed:', error);
      return {
        visitors: EMPTY_SERIES,
        promptViews: EMPTY_SERIES,
        promptCopies: EMPTY_SERIES,
        generatorUsage: EMPTY_SERIES,
        signups: EMPTY_SERIES,
        revenue: EMPTY_SERIES,
        conversions: EMPTY_SERIES,
        topPrompts: [],
        topSearches: [],
        topCategories: [],
      } satisfies SeriesResponse;
    } finally {
      // Only de-duplicate within a single render pass.
      setTimeout(() => seriesCache.delete(days), 0);
    }
  })();

  seriesCache.set(days, request);
  return request;
}

export const dailyVisitors = async (days = 30) => (await allSeries(days)).visitors;
export const dailyPromptViews = async (days = 30) => (await allSeries(days)).promptViews;
export const dailyPromptCopies = async (days = 30) => (await allSeries(days)).promptCopies;
export const dailyGeneratorUsage = async (days = 30) => (await allSeries(days)).generatorUsage;
export const dailySignups = async (days = 30) => (await allSeries(days)).signups;
export const dailyRevenue = async (days = 30) => (await allSeries(days)).revenue;
export const dailyPremiumConversions = async (days = 30) => (await allSeries(days)).conversions;

export async function topPrompts(limit = 10): Promise<TopPromptRow[]> {
  return (await allSeries(30)).topPrompts.slice(0, limit);
}

export async function topSearches(limit = 10, days = 30): Promise<TopSearchRow[]> {
  return (await allSeries(days)).topSearches.slice(0, limit);
}

export async function topCategories(limit = 8): Promise<TopCategoryRow[]> {
  return (await allSeries(30)).topCategories.slice(0, limit);
}

export async function platformStats(): Promise<PlatformStats> {
  return apiRequest<PlatformStats>('/v1/admin/stats', { token: await adminToken() });
}

/**
 * Popular search terms for the public discovery UI. Anonymous-safe, so it uses
 * the catalog endpoint rather than the admin aggregates.
 */
export async function popularSearchTerms(limit = 8): Promise<string[]> {
  try {
    const data = await apiRequest<{ popular: { term: string; hits: number }[] }>(
      `/v1/catalog/search/discovery${query({ limit })}`,
      { revalidate: 300 },
    );
    return data.popular.map((row) => row.term);
  } catch {
    return [];
  }
}
