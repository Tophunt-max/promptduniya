import Link from 'next/link';

import { cn } from '@/lib/utils';
import { ChevronLeftIcon, ChevronRightIcon } from './icon';

/**
 * Server-rendered, link-based pagination.
 *
 * Using real anchors keeps pages crawlable and means the control works with
 * JavaScript disabled — important for the SEO-facing listing pages.
 */

function pageNumbers(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set<number>([1, total, current]);
  if (current - 1 > 1) pages.add(current - 1);
  if (current + 1 < total) pages.add(current + 1);
  if (current <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (current >= total - 2) {
    pages.add(total - 1);
    pages.add(total - 2);
    pages.add(total - 3);
  }

  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) out.push('gap');
    out.push(page);
    previous = page;
  }
  return out;
}

export interface PaginationProps {
  page: number;
  totalPages: number;
  /** Builds the href for a given page, preserving existing filters. */
  buildHref: (page: number) => string;
  className?: string;
}

export function Pagination({ page, totalPages, buildHref, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  const items = pageNumbers(page, totalPages);
  const linkClass =
    'grid h-10 min-w-10 place-items-center rounded-xl px-3 text-sm font-semibold transition-colors';

  return (
    <nav aria-label="Pagination" className={cn('flex items-center justify-center gap-1.5', className)}>
      {page > 1 ? (
        <Link
          href={buildHref(page - 1)}
          rel="prev"
          aria-label="Previous page"
          className={cn(linkClass, 'text-body hover:bg-[var(--surface-sunken)]')}
        >
          <ChevronLeftIcon size={18} />
        </Link>
      ) : (
        <span aria-hidden="true" className={cn(linkClass, 'opacity-35')}>
          <ChevronLeftIcon size={18} />
        </span>
      )}

      {items.map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} className="px-1 text-sm text-faint" aria-hidden="true">
            …
          </span>
        ) : (
          <Link
            key={item}
            href={buildHref(item)}
            aria-current={item === page ? 'page' : undefined}
            className={cn(
              linkClass,
              item === page
                ? 'gradient-brand text-white shadow-[0_8px_20px_-12px_rgb(91_61_245/0.8)]'
                : 'text-body hover:bg-[var(--surface-sunken)]',
            )}
          >
            {item}
          </Link>
        ),
      )}

      {page < totalPages ? (
        <Link
          href={buildHref(page + 1)}
          rel="next"
          aria-label="Next page"
          className={cn(linkClass, 'text-body hover:bg-[var(--surface-sunken)]')}
        >
          <ChevronRightIcon size={18} />
        </Link>
      ) : (
        <span aria-hidden="true" className={cn(linkClass, 'opacity-35')}>
          <ChevronRightIcon size={18} />
        </span>
      )}
    </nav>
  );
}

export function ResultCount({
  total,
  page,
  pageSize,
}: {
  total: number;
  page: number;
  pageSize: number;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <p className="text-sm text-body" aria-live="polite">
      Showing <strong className="font-semibold text-[var(--text-primary)]">{from}–{to}</strong> of{' '}
      <strong className="font-semibold text-[var(--text-primary)]">{total}</strong> prompts
    </p>
  );
}
