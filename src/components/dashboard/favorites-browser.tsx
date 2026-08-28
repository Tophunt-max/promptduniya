'use client';

import { useMemo, useState } from 'react';

import { AI_MODELS } from '@/lib/constants';
import type { PromptCardData } from '@/services/prompts';
import { PromptGrid } from '../prompt/prompt-grid';
import { NoFavoritesState } from '../ui/empty-state';
import { Input, Select } from '../ui/field';
import { SearchIcon } from '../ui/icon';

type SortKey = 'recent' | 'oldest' | 'title' | 'most-copied';

interface SavedPrompt extends PromptCardData {
  savedAt: number;
}

/**
 * Client-side search, filter and sort over the user's own saved prompts.
 *
 * Everything is already loaded (favourites are capped per plan), so filtering
 * in the browser is instant and avoids a round trip per keystroke.
 */
export function FavoritesBrowser({
  favorites,
  canSeePremium,
}: {
  favorites: SavedPrompt[];
  canSeePremium: boolean;
}) {
  const [query, setQuery] = useState('');
  const [model, setModel] = useState('');
  const [accessFilter, setAccessFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = favorites.filter((prompt) => {
      if (model && prompt.aiModel !== model) return false;
      if (accessFilter === 'free' && prompt.isPremium) return false;
      if (accessFilter === 'premium' && !prompt.isPremium) return false;
      if (!needle) return true;
      return (
        prompt.title.toLowerCase().includes(needle) ||
        prompt.shortDescription.toLowerCase().includes(needle) ||
        prompt.categoryName.toLowerCase().includes(needle)
      );
    });

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return a.savedAt - b.savedAt;
        case 'title':
          return a.title.localeCompare(b.title);
        case 'most-copied':
          return b.copyCount - a.copyCount;
        default:
          return b.savedAt - a.savedAt;
      }
    });
  }, [favorites, query, model, accessFilter, sort]);

  if (favorites.length === 0) return <NoFavoritesState />;

  return (
    <div>
      <div className="mb-5 grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <Input
          type="search"
          placeholder="Search your saved prompts…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          leadingIcon={<SearchIcon size={17} />}
          aria-label="Search saved prompts"
        />
        <Select
          value={model}
          onChange={(event) => setModel(event.target.value)}
          options={AI_MODELS.map((m) => ({ value: m.id, label: m.short }))}
          placeholder="All models"
          aria-label="Filter by AI model"
        />
        <Select
          value={accessFilter}
          onChange={(event) => setAccessFilter(event.target.value)}
          options={[
            { value: 'free', label: 'Free' },
            { value: 'premium', label: 'Premium' },
          ]}
          placeholder="All prompts"
          aria-label="Filter by access"
        />
        <Select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          options={[
            { value: 'recent', label: 'Recently saved' },
            { value: 'oldest', label: 'Oldest first' },
            { value: 'title', label: 'Title A–Z' },
            { value: 'most-copied', label: 'Most copied' },
          ]}
          aria-label="Sort saved prompts"
        />
      </div>

      <p className="mb-4 text-sm text-body" aria-live="polite">
        {visible.length === favorites.length
          ? `${favorites.length} saved prompt${favorites.length === 1 ? '' : 's'}`
          : `${visible.length} of ${favorites.length} shown`}
      </p>

      <PromptGrid
        prompts={visible}
        canSeePremium={canSeePremium}
        columns={3}
        priorityCount={3}
        emptyState={
          <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--border-strong)] px-6 py-12 text-center">
            <p className="text-sm font-semibold">Nothing matches those filters</p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setModel('');
                setAccessFilter('');
              }}
              className="mt-2 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300"
            >
              Clear filters
            </button>
          </div>
        }
      />
    </div>
  );
}
