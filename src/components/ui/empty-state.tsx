import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { ButtonLink } from './button';
import { BookmarkIcon, CompassIcon, HeartIcon, SearchIcon, SparkleIcon } from './icon';

/**
 * Empty states.
 *
 * Each one names the situation plainly and offers exactly one obvious next
 * action, so a blank list never feels like a broken page.
 */

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
  className?: string;
  children?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--border-strong)] px-6 py-14 text-center',
        className,
      )}
    >
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
        {icon ?? <SparkleIcon size={26} />}
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm text-body">{description}</p>}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {action && <ButtonLink href={action.href}>{action.label}</ButtonLink>}
          {secondaryAction && (
            <ButtonLink href={secondaryAction.href} variant="outline">
              {secondaryAction.label}
            </ButtonLink>
          )}
        </div>
      )}
      {children && <div className="mt-5 w-full">{children}</div>}
    </div>
  );
}

export function NoPromptsState({ description }: { description?: string }) {
  return (
    <EmptyState
      icon={<CompassIcon size={26} />}
      title="No prompts here yet"
      description={
        description ?? 'Try widening your filters, or explore the full library to find something new.'
      }
      action={{ label: 'Explore prompts', href: '/explore' }}
    />
  );
}

export function NoFavoritesState() {
  return (
    <EmptyState
      icon={<BookmarkIcon size={26} />}
      title="No saved prompts yet"
      description="Tap the bookmark on any prompt to keep it here for later."
      action={{ label: 'Explore prompts', href: '/explore' }}
    />
  );
}

export function NoLikesState() {
  return (
    <EmptyState
      icon={<HeartIcon size={26} />}
      title="You haven't liked anything yet"
      description="Likes help us surface the prompts the community actually uses."
      action={{ label: 'Browse trending', href: '/explore?sort=trending' }}
    />
  );
}

export function NoSearchResultsState({
  query,
  children,
}: {
  query: string;
  children?: ReactNode;
}) {
  return (
    <EmptyState
      icon={<SearchIcon size={26} />}
      title={`No results for “${query}”`}
      description="Check the spelling, try a shorter phrase, or browse by category instead."
      action={{ label: 'Browse categories', href: '/categories' }}
      secondaryAction={{ label: 'Open the generator', href: '/generator' }}
    >
      {children}
    </EmptyState>
  );
}

export function NoGeneratedState() {
  return (
    <EmptyState
      icon={<SparkleIcon size={26} />}
      title="Nothing generated yet"
      description="Describe what you want and the generator will write a production-ready prompt for you."
      action={{ label: 'Open the generator', href: '/generator' }}
    />
  );
}
