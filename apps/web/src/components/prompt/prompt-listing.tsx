import { Suspense, type ReactNode } from 'react';

import {
  ActiveFilterChips,
  FilterDrawer,
  FilterSidebar,
  SortSelect,
} from './filter-drawer';
import { PromptGrid } from './prompt-grid';
import { Pagination, ResultCount } from '../ui/pagination';
import { PromptGridSkeleton } from '../ui/skeleton';
import type { CategorySummary } from '@/services/categories';
import type { PromptListResult } from '@/services/prompts';

/**
 * Shared listing shell used by /explore, /category/[slug] and /search.
 *
 * Filters are URL-driven, so the whole listing is server-rendered and every
 * filtered view is a real, crawlable, shareable URL.
 */

export interface PromptListingProps {
  result: PromptListResult;
  categories: CategorySummary[];
  canSeePremium: boolean;
  /** Builds page links while preserving the current query string. */
  buildHref: (page: number) => string;
  lockCategory?: boolean;
  emptyState?: ReactNode;
  header?: ReactNode;
}

export function PromptListing({
  result,
  categories,
  canSeePremium,
  buildHref,
  lockCategory,
  emptyState,
  header,
}: PromptListingProps) {
  return (
    <div className="flex gap-8">
      <Suspense fallback={null}>
        <FilterSidebar categories={categories} lockCategory={lockCategory} />
      </Suspense>

      <div className="min-w-0 flex-1">
        {header}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <ResultCount total={result.total} page={result.page} pageSize={result.pageSize} />
          <div className="flex items-center gap-2">
            <Suspense fallback={null}>
              <SortSelect />
            </Suspense>
            <div className="lg:hidden">
              <Suspense fallback={null}>
                <FilterDrawer categories={categories} lockCategory={lockCategory} />
              </Suspense>
            </div>
          </div>
        </div>

        <Suspense fallback={null}>
          <div className="mb-4">
            <ActiveFilterChips categories={categories} />
          </div>
        </Suspense>

        <Suspense fallback={<PromptGridSkeleton count={8} />}>
          <PromptGrid
            prompts={result.items}
            canSeePremium={canSeePremium}
            columns={4}
            priorityCount={4}
            emptyState={emptyState}
          />
        </Suspense>

        {result.totalPages > 1 && (
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            buildHref={buildHref}
            className="mt-10"
          />
        )}
      </div>
    </div>
  );
}

/** Builds a `?page=n` href builder that preserves existing search params. */
export function pageHrefBuilder(
  basePath: string,
  params: Record<string, string | undefined>,
): (page: number) => string {
  return (page: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== 'page') search.set(key, value);
    }
    if (page > 1) search.set('page', String(page));
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
}
