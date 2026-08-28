import { apiRequest, query } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import type { PromptListResult } from './prompts';

/** Search and discovery, served by the API. */

export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
}

export interface SearchOptions {
  query: string;
  page?: number;
  pageSize?: number;
  category?: string;
  model?: string;
  access?: string;
  sort?: string;
  style?: string;
  gender?: string;
  aspect?: string;
  viewerId?: string | null;
  visitorHash?: string | null;
  /** When false the query is not recorded in the popular/recent lists. */
  track?: boolean;
}

export async function searchPrompts(options: SearchOptions): Promise<PromptListResult> {
  return apiRequest<PromptListResult>(
    `/v1/catalog/search${query({
      q: options.query,
      page: options.page,
      pageSize: options.pageSize,
      category: options.category,
      model: options.model,
      access: options.access,
      sort: options.sort,
      style: options.style,
      track: options.track === false ? 0 : undefined,
    })}`,
    { token: await getAccessToken() },
  );
}

export interface Suggestion {
  type: 'prompt' | 'category' | 'tag' | 'model' | 'style';
  label: string;
  href: string;
  hint?: string;
}

export async function suggest(rawQuery: string, limit = 8): Promise<Suggestion[]> {
  const data = await apiRequest<{ suggestions: Suggestion[] }>(
    `/v1/catalog/search/suggest${query({ q: rawQuery })}`,
  );
  return data.suggestions.slice(0, limit);
}

interface DiscoveryResponse {
  popular: { term: string; hits: number }[];
  recent: string[];
  alternatives: { title: string; slug: string }[];
}

async function discovery(q?: string, limit?: number): Promise<DiscoveryResponse> {
  try {
    return await apiRequest<DiscoveryResponse>(
      `/v1/catalog/search/discovery${query({ q, limit })}`,
      { token: await getAccessToken() },
    );
  } catch (error) {
    console.error('[search] discovery lookup failed:', error);
    return { popular: [], recent: [], alternatives: [] };
  }
}

export async function popularSearches(limit = 8): Promise<{ term: string; hits: number }[]> {
  return (await discovery(undefined, limit)).popular;
}

export async function recentSearchesForUser(_userId: string, limit = 6): Promise<string[]> {
  return (await discovery()).recent.slice(0, limit);
}

/** Loose word-match fallbacks shown when a search returns nothing. */
export async function noResultAlternatives(
  searchQuery: string,
  limit = 6,
): Promise<{ title: string; slug: string }[]> {
  return (await discovery(searchQuery)).alternatives.slice(0, limit);
}
