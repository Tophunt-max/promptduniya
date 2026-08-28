import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { PromptCardData } from '@/services/prompts';
import { ArrowRightIcon } from '../ui/icon';
import { NoPromptsState } from '../ui/empty-state';
import { PromptCard, PromptRow } from './prompt-card';

/**
 * Grid + section wrappers.
 *
 * `canSeePremium` is resolved on the server and passed down, so the grid can
 * mark premium cards as locked without ever holding the prompt bodies.
 */

export interface PromptGridProps {
  prompts: PromptCardData[];
  canSeePremium?: boolean;
  columns?: 2 | 3 | 4;
  compact?: boolean;
  priorityCount?: number;
  emptyState?: ReactNode;
  className?: string;
}

const COLUMN_CLASSES: Record<2 | 3 | 4, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
};

export function PromptGrid({
  prompts,
  canSeePremium,
  columns = 4,
  compact,
  priorityCount = 4,
  emptyState,
  className,
}: PromptGridProps) {
  if (prompts.length === 0) {
    return <>{emptyState ?? <NoPromptsState />}</>;
  }

  return (
    <div className={cn('grid gap-3 sm:gap-4', COLUMN_CLASSES[columns], className)}>
      {prompts.map((prompt, index) => (
        <PromptCard
          key={prompt.id}
          prompt={prompt}
          locked={prompt.isPremium && !canSeePremium}
          priority={index < priorityCount}
          compact={compact}
        />
      ))}
    </div>
  );
}

export function PromptRail({
  prompts,
  canSeePremium,
}: {
  prompts: PromptCardData[];
  canSeePremium?: boolean;
}) {
  if (prompts.length === 0) return null;
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {prompts.map((prompt) => (
        <PromptRow key={prompt.id} prompt={prompt} locked={prompt.isPremium && !canSeePremium} />
      ))}
    </div>
  );
}

export interface SectionHeaderProps {
  title: ReactNode;
  description?: string;
  action?: { label: string; href: string };
  eyebrow?: string;
  className?: string;
}

export function SectionHeader({
  title,
  description,
  action,
  eyebrow,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">
            {eyebrow}
          </p>
        )}
        <h2 className="text-xl font-extrabold sm:text-2xl">{title}</h2>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-body">{description}</p>}
      </div>
      {action && (
        <Link
          href={action.href}
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-lg text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-300"
        >
          {action.label}
          <ArrowRightIcon
            size={16}
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </Link>
      )}
    </div>
  );
}

export function Section({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('py-8 sm:py-12', className)}>
      {children}
    </section>
  );
}
