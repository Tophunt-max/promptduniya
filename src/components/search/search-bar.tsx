'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import { CloseIcon, SearchIcon, TagIcon } from '../ui/icon';

/**
 * Search with live suggestions.
 *
 * Suggestions are debounced (220ms) and aborted on each new keystroke so a fast
 * typist never queues a backlog of requests. Recent searches are kept in
 * localStorage — deliberately client-side only, so we are not storing search
 * history against an account unless the user actually submits a search.
 */

interface Suggestion {
  type: 'prompt' | 'category' | 'tag' | 'model' | 'style';
  label: string;
  href: string;
  hint?: string;
}

const RECENT_KEY = 'pd-recent-searches';
const MAX_RECENT = 6;

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function pushRecent(term: string) {
  try {
    const next = [term, ...readRecent().filter((t) => t !== term)].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage may be unavailable in private mode — non-critical */
  }
}

export interface SearchBarProps {
  placeholder?: string;
  size?: 'md' | 'lg';
  initialQuery?: string;
  autoFocus?: boolean;
  popularSearches?: string[];
  className?: string;
  onNavigate?: () => void;
}

export function SearchBar({
  placeholder = 'Search prompts, styles, categories…',
  size = 'md',
  initialQuery = '',
  autoFocus,
  popularSearches = [],
  className,
  onNavigate,
}: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setRecent(readRecent()), []);

  // Close on outside click.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const fetchSuggestions = useCallback(async (term: string) => {
    abortRef.current?.abort();
    if (term.trim().length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const data = await api.get<{ suggestions: Suggestion[] }>(
        `/api/search/suggest?q=${encodeURIComponent(term)}`,
      );
      if (!controller.signal.aborted) setSuggestions(data.suggestions);
    } catch {
      if (!controller.signal.aborted) setSuggestions([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  function onChange(value: string) {
    setQuery(value);
    setActiveIndex(-1);
    setOpen(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void fetchSuggestions(value), 220);
  }

  function submit(term: string) {
    const trimmed = term.trim();
    if (!trimmed) return;
    pushRecent(trimmed);
    setRecent(readRecent());
    setOpen(false);
    inputRef.current?.blur();
    onNavigate?.();
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  function goTo(href: string) {
    setOpen(false);
    onNavigate?.();
    router.push(href);
  }

  const items: { key: string; label: string; hint?: string; onSelect: () => void }[] = [
    ...suggestions.map((s, i) => ({
      key: `s-${i}`,
      label: s.label,
      hint: s.hint,
      onSelect: () => goTo(s.href),
    })),
  ];

  const showEmptyPanel = query.trim().length < 2;
  const emptyItems = [
    ...recent.map((term, i) => ({
      key: `r-${i}`,
      label: term,
      hint: 'Recent',
      onSelect: () => submit(term),
    })),
    ...popularSearches
      .filter((term) => !recent.includes(term))
      .map((term, i) => ({
        key: `p-${i}`,
        label: term,
        hint: 'Popular',
        onSelect: () => submit(term),
      })),
  ];

  const visibleItems = showEmptyPanel ? emptyItems : items;

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const active = visibleItems[activeIndex];
      if (active) active.onSelect();
      else submit(query);
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, visibleItems.length - 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    }
  }

  const inputHeight = size === 'lg' ? 'h-14 text-base' : 'h-11 text-sm';

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submit(query);
        }}
      >
        <label htmlFor="pd-search" className="sr-only">
          Search prompts
        </label>
        <div className="relative">
          <SearchIcon
            size={size === 'lg' ? 20 : 18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            ref={inputRef}
            id="pd-search"
            type="search"
            value={query}
            autoFocus={autoFocus}
            enterKeyHint="search"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls="pd-search-listbox"
            aria-autocomplete="list"
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className={cn(
              'w-full rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] pl-11 pr-24 font-medium',
              'placeholder:text-[var(--text-muted)] shadow-[var(--shadow-soft)] transition-shadow',
              'focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12',
              '[&::-webkit-search-cancel-button]:hidden',
              inputHeight,
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSuggestions([]);
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-[4.75rem] top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]"
            >
              <CloseIcon size={14} />
            </button>
          )}
          <button
            type="submit"
            className={cn(
              'gradient-brand absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full font-semibold text-white transition-[filter] hover:brightness-105',
              size === 'lg' ? 'h-11 px-5 text-sm' : 'h-8 px-4 text-xs',
            )}
          >
            Search
          </button>
        </div>
      </form>

      {open && (visibleItems.length > 0 || loading) && (
        <div
          id="pd-search-listbox"
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 max-h-[22rem] overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-lift)] animate-[fade-in_0.14s_ease-out]"
        >
          {showEmptyPanel && emptyItems.length > 0 && (
            <p className="px-3 pb-1 pt-2 text-[0.6875rem] font-bold uppercase tracking-wider text-faint">
              {recent.length > 0 ? 'Recent & popular' : 'Popular searches'}
            </p>
          )}
          {loading && !showEmptyPanel && visibleItems.length === 0 && (
            <p className="px-3 py-3 text-sm text-faint">Searching…</p>
          )}
          {visibleItems.map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={item.onSelect}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                index === activeIndex ? 'bg-[var(--surface-sunken)]' : 'hover:bg-[var(--surface-sunken)]',
              )}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <TagIcon size={15} className="shrink-0 text-[var(--text-muted)]" />
                <span className="truncate text-sm font-medium">{item.label}</span>
              </span>
              {item.hint && (
                <span className="shrink-0 text-[0.6875rem] font-semibold text-faint">{item.hint}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
