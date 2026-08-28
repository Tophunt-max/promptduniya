import Link from 'next/link';

import { cn, formatCompact } from '@/lib/utils';
import type { CategorySummary } from '@/services/categories';
import { ArrowRightIcon } from '../ui/icon';

/**
 * Category tiles.
 *
 * The accent colour is stored per category in the database (admin-editable), so
 * the visual identity of a category survives renames and reordering.
 */

const ACCENTS: Record<string, { from: string; to: string; text: string }> = {
  indigo: { from: 'from-brand-600', to: 'to-brand-400', text: 'text-brand-600' },
  violet: { from: 'from-violet-600', to: 'to-fuchsia-400', text: 'text-violet-600' },
  marigold: { from: 'from-marigold-500', to: 'to-marigold-300', text: 'text-marigold-600' },
  rose: { from: 'from-rose-600', to: 'to-pink-400', text: 'text-rose-600' },
  teal: { from: 'from-teal-600', to: 'to-emerald-400', text: 'text-teal-600' },
  sky: { from: 'from-sky-600', to: 'to-cyan-400', text: 'text-sky-600' },
  amber: { from: 'from-amber-500', to: 'to-yellow-300', text: 'text-amber-600' },
  emerald: { from: 'from-emerald-600', to: 'to-lime-400', text: 'text-emerald-600' },
  slate: { from: 'from-ink-700', to: 'to-ink-400', text: 'text-ink-600' },
};

function accentFor(name: string) {
  return ACCENTS[name] ?? ACCENTS.indigo!;
}

export function CategoryCard({
  category,
  className,
}: {
  category: CategorySummary;
  className?: string;
}) {
  const accent = accentFor(category.accent);

  return (
    <Link
      href={`/category/${category.slug}`}
      className={cn(
        'card card-hover group relative flex flex-col justify-between overflow-hidden p-4',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute -right-8 -top-8 size-24 rounded-full bg-gradient-to-br opacity-15 transition-transform duration-500 group-hover:scale-125',
          accent.from,
          accent.to,
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          'mb-3 grid size-10 place-items-center rounded-xl bg-gradient-to-br text-base font-black text-white shadow-sm',
          accent.from,
          accent.to,
        )}
      >
        {category.icon ?? category.name.charAt(0).toUpperCase()}
      </span>

      <span className="relative">
        <span className="block text-sm font-bold leading-snug">{category.name}</span>
        <span className="mt-0.5 block text-xs text-faint">
          {category.promptCount > 0
            ? `${formatCompact(category.promptCount)} prompt${category.promptCount === 1 ? '' : 's'}`
            : 'Coming soon'}
        </span>
      </span>
    </Link>
  );
}

/** Compact pill used in the horizontal category rail. */
export function CategoryChip({
  category,
  active,
}: {
  category: Pick<CategorySummary, 'name' | 'slug' | 'accent'>;
  active?: boolean;
}) {
  return (
    <Link
      href={`/category/${category.slug}`}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors',
        active
          ? 'border-transparent bg-ink-900 text-white dark:bg-white dark:text-ink-950'
          : 'border-[var(--border-subtle)] bg-[var(--surface-raised)] text-body hover:border-brand-400 hover:text-brand-600',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-2 rounded-full bg-gradient-to-br',
          accentFor(category.accent).from,
          accentFor(category.accent).to,
        )}
      />
      {category.name}
    </Link>
  );
}

export function CategoryGrid({ categories }: { categories: CategorySummary[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {categories.map((category) => (
        <CategoryCard key={category.id} category={category} />
      ))}
    </div>
  );
}

/** Wide banner card for the category landing page header. */
export function CategoryHero({
  name,
  description,
  promptCount,
  accent = 'indigo',
}: {
  name: string;
  description?: string | null;
  promptCount: number;
  accent?: string;
}) {
  const tone = accentFor(accent);
  return (
    <div className="card relative overflow-hidden p-6 sm:p-8">
      <span
        aria-hidden="true"
        className={cn(
          'absolute -right-16 -top-16 size-56 rounded-full bg-gradient-to-br opacity-15',
          tone.from,
          tone.to,
        )}
      />
      <div className="relative max-w-2xl">
        <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">
          Category
        </p>
        <h1 className="text-2xl font-extrabold sm:text-3xl">{name} AI prompts</h1>
        {description && <p className="mt-2 text-sm leading-relaxed text-body">{description}</p>}
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-faint">
          {formatCompact(promptCount)} prompts
          <ArrowRightIcon size={14} />
        </p>
      </div>
    </div>
  );
}
