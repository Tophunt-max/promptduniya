'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import {
  ACCESS_FILTERS,
  AI_MODELS,
  ASPECT_RATIOS,
  GENDERS,
  SORT_OPTIONS,
  STYLES,
} from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { CategorySummary } from '@/services/categories';
import { Button } from '../ui/button';
import { ChipGroup } from '../ui/field';
import { FilterIcon } from '../ui/icon';
import { Modal } from '../ui/modal';

/**
 * Filter controls.
 *
 * Filters live in the URL, which keeps them shareable, back-button friendly and
 * server-renderable. On desktop they sit inline; on mobile they collapse into a
 * bottom-sheet drawer with a live count of what is applied.
 */

export interface FilterState {
  category?: string;
  model?: string;
  access?: string;
  sort?: string;
  style?: string;
  gender?: string;
  aspect?: string;
}

const FILTER_KEYS: (keyof FilterState)[] = [
  'category',
  'model',
  'access',
  'sort',
  'style',
  'gender',
  'aspect',
];

function activeCount(state: FilterState): number {
  return FILTER_KEYS.filter((key) => {
    const value = state[key];
    if (!value) return false;
    if (key === 'access' && value === 'all') return false;
    if (key === 'sort' && value === 'trending') return false;
    return true;
  }).length;
}

export function useFilterNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo<FilterState>(
    () => ({
      category: searchParams.get('category') ?? undefined,
      model: searchParams.get('model') ?? undefined,
      access: searchParams.get('access') ?? 'all',
      sort: searchParams.get('sort') ?? 'trending',
      style: searchParams.get('style') ?? undefined,
      gender: searchParams.get('gender') ?? undefined,
      aspect: searchParams.get('aspect') ?? undefined,
    }),
    [searchParams],
  );

  function apply(next: FilterState) {
    const params = new URLSearchParams(searchParams.toString());
    // Preserve the search term; drop pagination whenever filters change.
    params.delete('page');

    for (const key of FILTER_KEYS) {
      const value = next[key];
      const isDefault =
        (key === 'access' && (value === 'all' || !value)) ||
        (key === 'sort' && (value === 'trending' || !value));
      if (!value || isDefault) params.delete(key);
      else params.set(key, value);
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function clear() {
    const params = new URLSearchParams();
    const query = searchParams.get('q');
    if (query) params.set('q', query);
    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  return { state, apply, clear, count: activeCount(state) };
}

/** Sort selector — always visible, since it is the most-used control. */
export function SortSelect() {
  const { state, apply } = useFilterNavigation();

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">Sort prompts by</span>
      <select
        value={state.sort ?? 'trending'}
        onChange={(event) => apply({ ...state, sort: event.target.value })}
        className="h-10 cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 pr-8 text-sm font-semibold focus:border-brand-500 focus:outline-none"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface FilterPanelProps {
  categories: CategorySummary[];
  /** Locks the category control on a category landing page. */
  lockCategory?: boolean;
}

function FilterFields({
  categories,
  lockCategory,
  draft,
  setDraft,
}: FilterPanelProps & {
  draft: FilterState;
  setDraft: (next: FilterState) => void;
}) {
  return (
    <div className="grid gap-5">
      {!lockCategory && (
        <ChipGroup
          label="Category"
          value={draft.category}
          onChange={(category) => setDraft({ ...draft, category })}
          options={categories.map((c) => ({ value: c.slug, label: c.name }))}
        />
      )}

      <ChipGroup
        label="AI model"
        value={draft.model}
        onChange={(model) => setDraft({ ...draft, model })}
        options={AI_MODELS.map((m) => ({ value: m.id, label: m.short }))}
      />

      <ChipGroup
        label="Access"
        value={draft.access === 'all' ? undefined : draft.access}
        allowClear={false}
        onChange={(access) => setDraft({ ...draft, access: access ?? 'all' })}
        options={ACCESS_FILTERS.filter((a) => a.id !== 'all').map((a) => ({
          value: a.id,
          label: a.label,
        }))}
      />

      <ChipGroup
        label="Style"
        value={draft.style}
        onChange={(style) => setDraft({ ...draft, style })}
        options={STYLES.map((style) => ({ value: style, label: style }))}
      />

      <ChipGroup
        label="Subject"
        value={draft.gender}
        onChange={(gender) => setDraft({ ...draft, gender })}
        options={GENDERS.filter((g) => g.id !== 'any').map((g) => ({ value: g.id, label: g.label }))}
      />

      <ChipGroup
        label="Aspect ratio"
        value={draft.aspect}
        onChange={(aspect) => setDraft({ ...draft, aspect })}
        options={ASPECT_RATIOS.map((a) => ({ value: a.id, label: a.id }))}
      />

      <ChipGroup
        label="Sort by"
        value={draft.sort === 'trending' ? undefined : draft.sort}
        allowClear={false}
        onChange={(sort) => setDraft({ ...draft, sort: sort ?? 'trending' })}
        options={SORT_OPTIONS.map((s) => ({ value: s.id, label: s.label }))}
      />
    </div>
  );
}

/** Mobile bottom-sheet trigger + drawer. */
export function FilterDrawer({ categories, lockCategory }: FilterPanelProps) {
  const { state, apply, clear, count } = useFilterNavigation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterState>(state);

  function openDrawer() {
    setDraft(state);
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition-colors',
          count > 0
            ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-200'
            : 'border-[var(--border-subtle)] bg-[var(--surface-raised)] hover:border-[var(--border-strong)]',
        )}
      >
        <FilterIcon size={17} />
        Filters
        {count > 0 && (
          <span className="grid size-5 place-items-center rounded-full bg-brand-600 text-[0.625rem] font-bold text-white">
            {count}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Filter prompts"
        description="Narrow the library down to exactly what you need."
        sheet
        footer={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              fullWidth
              onClick={() => {
                clear();
                setOpen(false);
              }}
            >
              Clear all
            </Button>
            <Button
              fullWidth
              onClick={() => {
                apply(draft);
                setOpen(false);
              }}
            >
              Show results
            </Button>
          </div>
        }
      >
        <FilterFields
          categories={categories}
          lockCategory={lockCategory}
          draft={draft}
          setDraft={setDraft}
        />
      </Modal>
    </>
  );
}

/** Desktop sidebar variant — applies changes immediately. */
export function FilterSidebar({ categories, lockCategory }: FilterPanelProps) {
  const { state, apply, clear, count } = useFilterNavigation();

  return (
    <aside className="hidden w-60 shrink-0 lg:block" aria-label="Filters">
      <div className="sticky top-20 grid gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Filters</h2>
          {count > 0 && (
            <button
              type="button"
              onClick={clear}
              className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
            >
              Clear all
            </button>
          )}
        </div>
        <FilterFields
          categories={categories}
          lockCategory={lockCategory}
          draft={state}
          setDraft={apply}
        />
      </div>
    </aside>
  );
}

/** Removable chips summarising what is currently applied. */
export function ActiveFilterChips({ categories }: { categories: CategorySummary[] }) {
  const { state, apply, count } = useFilterNavigation();
  if (count === 0) return null;

  const labels: { key: keyof FilterState; label: string }[] = [];
  if (state.category) {
    labels.push({
      key: 'category',
      label: categories.find((c) => c.slug === state.category)?.name ?? state.category,
    });
  }
  if (state.model) {
    labels.push({
      key: 'model',
      label: AI_MODELS.find((m) => m.id === state.model)?.label ?? state.model,
    });
  }
  if (state.access && state.access !== 'all') {
    labels.push({ key: 'access', label: state.access === 'free' ? 'Free' : 'Premium' });
  }
  if (state.style) labels.push({ key: 'style', label: state.style });
  if (state.gender) {
    labels.push({
      key: 'gender',
      label: GENDERS.find((g) => g.id === state.gender)?.label ?? state.gender,
    });
  }
  if (state.aspect) labels.push({ key: 'aspect', label: state.aspect });
  if (state.sort && state.sort !== 'trending') {
    labels.push({
      key: 'sort',
      label: SORT_OPTIONS.find((s) => s.id === state.sort)?.label ?? state.sort,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {labels.map((item) => (
        <button
          key={`${item.key}-${item.label}`}
          type="button"
          onClick={() =>
            apply({
              ...state,
              [item.key]: item.key === 'access' ? 'all' : item.key === 'sort' ? 'trending' : undefined,
            })
          }
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100 dark:bg-brand-950/60 dark:text-brand-200"
        >
          {item.label}
          <span aria-hidden="true">×</span>
          <span className="sr-only">Remove filter</span>
        </button>
      ))}
    </div>
  );
}
