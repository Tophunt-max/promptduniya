import type { ReactNode } from 'react';

import { aiModel } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { CameraIcon, CrownIcon, FlameIcon, SparkleIcon } from './icon';

export type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'marigold'
  | 'peacock'
  | 'rose'
  | 'success'
  | 'outline';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--surface-sunken)] text-[var(--text-secondary)]',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-950/70 dark:text-brand-200',
  marigold: 'bg-marigold-50 text-marigold-700 dark:bg-marigold-900/40 dark:text-marigold-200',
  peacock: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-200',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-200',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200',
  outline: 'border border-[var(--border-subtle)] text-[var(--text-secondary)]',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  icon,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold tracking-wide',
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function PremiumBadge({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-marigold-500 to-marigold-600 px-2.5 py-1 text-[0.6875rem] font-bold text-white shadow-[0_4px_14px_-6px_rgb(242_106_18/0.9)]',
        className,
      )}
    >
      <CrownIcon size={12} />
      {!compact && 'Premium'}
    </span>
  );
}

export function TrendingBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-rose-500/95 px-2.5 py-1 text-[0.6875rem] font-bold text-white',
        className,
      )}
    >
      <FlameIcon size={12} />
      Trending
    </span>
  );
}

export function EditorsPickBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-[0.6875rem] font-bold text-white',
        className,
      )}
    >
      <SparkleIcon size={12} />
      Editor&rsquo;s pick
    </span>
  );
}

const MODEL_TONES: Record<string, BadgeTone> = {
  gemini: 'peacock',
  chatgpt: 'success',
  midjourney: 'brand',
  flux: 'marigold',
  'stable-diffusion': 'rose',
  leonardo: 'peacock',
  ideogram: 'brand',
  other: 'neutral',
};

/** Model chip — the label always matches the model the prompt was written for. */
export function ModelBadge({ model, className }: { model: string; className?: string }) {
  const meta = aiModel(model);
  return (
    <Badge tone={MODEL_TONES[model] ?? 'neutral'} className={className}>
      {meta.short}
    </Badge>
  );
}

/**
 * Input-mode chip.
 *
 * Only rendered for photo-edit prompts. Text-to-image is the default and the
 * overwhelming majority, so badging it too would add noise to every card
 * without telling the reader anything — the useful signal is the exception.
 */
export function InputModeBadge({ mode, className }: { mode: string; className?: string }) {
  if (mode !== 'photo-edit') return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-ink-900/85 px-2.5 py-1 text-[0.6875rem] font-bold text-white backdrop-blur dark:bg-white/90 dark:text-ink-950',
        className,
      )}
    >
      <CameraIcon size={12} />
      Your photo
    </span>
  );
}

export function DifficultyBadge({ level }: { level: string }) {
  const tone: BadgeTone =
    level === 'advanced' ? 'rose' : level === 'intermediate' ? 'marigold' : 'success';
  return (
    <Badge tone={tone} className="capitalize">
      {level}
    </Badge>
  );
}

export function StatusDot({ active, label }: { active: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span
        className={cn('size-2 rounded-full', active ? 'bg-emerald-500' : 'bg-ink-400')}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
