import type { Metadata } from 'next';
import Link from 'next/link';

import { PromptListing, pageHrefBuilder } from '@/components/prompt/prompt-listing';
import { SearchBar } from '@/components/search/search-bar';
import { NoSearchResultsState } from '@/components/ui/empty-state';
import { buildMetadata } from '@/lib/seo';
import { PAGE_SIZE } from '@/lib/constants';
import { canSeePremium, getAccess } from '@/lib/viewer';
import { hashVisitor } from '@/lib/crypto';
import { listCategories } from '@/services/categories';
import {
  noResultAlternatives,
  popularSearches,
  recentSearchesForUser,
  searchPrompts,
} from '@/services/search';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const params = await searchParams;
  const query = firstValue(params.q)?.trim();

  return buildMetadata({
    title: query ? `Search results for “${query}”` : 'Search AI prompts',
    description: query
      ? `AI image prompts matching “${query}”. Filter by category, model, style and aspect ratio.`
      : 'Search the full library of AI image prompts by title, prompt text, category, tag, model or style.',
    path: '/search',
    // Search result pages are intentionally excluded from the index.
    noIndex: true,
  });
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) flat[key] = firstValue(value);

  const query = (flat.q ?? '').trim();
  const page = Number.parseInt(flat.page ?? '1', 10) || 1;

  const [access, premiumVisible, categories, popular] = await Promise.all([
    getAccess(),
    canSeePremium(),
    listCategories(),
    popularSearches(8).catch(() => []),
  ]);

  const recent = access.userId
    ? await recentSearchesForUser(access.userId, 6).catch(() => [])
    : [];

  const result = await searchPrompts({
    query,
    page,
    pageSize: PAGE_SIZE,
    category: flat.category,
    model: flat.model,
    access: flat.access,
    sort: flat.sort,
    style: flat.style,
    gender: flat.gender,
    aspect: flat.aspect,
    viewerId: access.userId,
    visitorHash: hashVisitor(null, null),
  });

  const alternatives =
    query && result.total === 0 ? await noResultAlternatives(query, 6).catch(() => []) : [];

  return (
    <div className="container-page py-8 sm:py-10">
      <header className="mx-auto mb-8 max-w-3xl text-center">
        <h1 className="text-2xl font-extrabold sm:text-3xl">
          {query ? (
            <>
              Results for <span className="gradient-text">“{query}”</span>
            </>
          ) : (
            'Search prompts'
          )}
        </h1>
        <p className="mt-2 text-sm text-body">
          {query
            ? `${result.total} prompt${result.total === 1 ? '' : 's'} matched your search.`
            : 'Search by title, prompt text, category, tag, AI model or style.'}
        </p>
        <div className="mt-5">
          <SearchBar
            size="lg"
            initialQuery={query}
            autoFocus={!query}
            popularSearches={popular.map((p) => p.term)}
          />
        </div>
      </header>

      {!query ? (
        <div className="mx-auto max-w-3xl">
          {recent.length > 0 && (
            <TermSection title="Your recent searches" terms={recent} />
          )}
          {popular.length > 0 && (
            <TermSection
              title="Popular searches"
              terms={popular.map((p) => p.term)}
              className="mt-8"
            />
          )}
          <div className="mt-10 text-center">
            <Link
              href="/explore"
              className="text-sm font-semibold text-brand-600 underline underline-offset-4 dark:text-brand-300"
            >
              Or browse the full library
            </Link>
          </div>
        </div>
      ) : (
        <PromptListing
          result={result}
          categories={categories}
          canSeePremium={premiumVisible}
          buildHref={pageHrefBuilder('/search', flat)}
          emptyState={
            <NoSearchResultsState query={query}>
              {alternatives.length > 0 && (
                <div className="mx-auto max-w-md text-left">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-faint">
                    You might mean
                  </p>
                  <ul className="grid gap-1.5">
                    {alternatives.map((item) => (
                      <li key={item.slug}>
                        <Link
                          href={`/prompt/${item.slug}`}
                          className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                        >
                          {item.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </NoSearchResultsState>
          }
        />
      )}
    </div>
  );
}

function TermSection({
  title,
  terms,
  className,
}: {
  title: string;
  terms: string[];
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="mb-3 text-sm font-bold">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {terms.map((term) => (
          <Link
            key={term}
            href={`/search?q=${encodeURIComponent(term)}`}
            className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-2 text-sm font-medium text-body transition-colors hover:border-brand-400 hover:text-brand-600"
          >
            {term}
          </Link>
        ))}
      </div>
    </section>
  );
}
