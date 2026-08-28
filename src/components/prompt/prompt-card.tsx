import Link from 'next/link';

import { aiModel } from '@/lib/constants';
import { cn, formatCompact } from '@/lib/utils';
import type { PromptCardData } from '@/services/prompts';
import { EditorsPickBadge, ModelBadge, PremiumBadge, TrendingBadge } from '../ui/badge';
import { CopyIcon, EyeIcon, LockIcon } from '../ui/icon';
import { CopyPromptButton, FavoriteButton, LikeButton } from './prompt-actions';
import { PromptArtwork } from './prompt-artwork';

/**
 * The primary discovery unit.
 *
 * The whole card is one link for large tap targets, with the interactive
 * controls layered above it. `locked` blurs the artwork and swaps the copy
 * button for an upgrade path — but the prompt body was never sent here anyway.
 */

export interface PromptCardProps {
  prompt: PromptCardData;
  /** True when the viewer cannot access this premium prompt. */
  locked?: boolean;
  priority?: boolean;
  compact?: boolean;
  className?: string;
}

export function PromptCard({ prompt, locked, priority, compact, className }: PromptCardProps) {
  const model = aiModel(prompt.aiModel);
  const href = `/prompt/${prompt.slug}`;

  return (
    <article
      className={cn(
        'card card-hover group relative flex flex-col overflow-hidden',
        className,
      )}
    >
      <div className="relative">
        <Link href={href} className="block" tabIndex={-1} aria-hidden="true">
          <PromptArtwork
            seed={prompt.slug}
            title={prompt.title}
            imageUrl={prompt.coverImageUrl}
            alt={prompt.coverImageAlt}
            ratio={compact ? 'square' : 'portrait'}
            priority={priority}
            locked={locked}
          />
        </Link>

        {/* Top-left status badges */}
        <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex flex-wrap items-start gap-1.5">
          {prompt.isTrending && <TrendingBadge />}
          {prompt.isPremium && <PremiumBadge compact={compact} />}
          {prompt.isEditorsPick && !compact && !prompt.isTrending && <EditorsPickBadge />}
        </div>

        {/* Top-right quick actions */}
        <div className="absolute right-2 top-2 flex flex-col gap-1 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100 md:opacity-0 max-md:opacity-100">
          <FavoriteButton
            promptId={prompt.id}
            initialSaved={prompt.savedByMe}
            compact
            className="bg-[var(--surface-raised)]/92 backdrop-blur"
          />
          <LikeButton
            promptId={prompt.id}
            initialLiked={prompt.likedByMe}
            initialCount={prompt.likeCount}
            compact
            className="bg-[var(--surface-raised)]/92 backdrop-blur"
          />
        </div>

        {locked && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="flex items-center gap-1.5 rounded-full bg-ink-950/70 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">
              <LockIcon size={13} />
              Premium
            </span>
          </div>
        )}
      </div>

      <div className={cn('flex flex-1 flex-col gap-2 p-3.5', compact && 'gap-1.5 p-3')}>
        <div className="flex flex-wrap items-center gap-1.5">
          <ModelBadge model={prompt.aiModel} />
          <Link
            href={`/category/${prompt.categorySlug}`}
            className="rounded-full px-2 py-1 text-[0.6875rem] font-semibold text-faint transition-colors hover:text-brand-600"
          >
            {prompt.categoryName}
          </Link>
        </div>

        <h3 className={cn('font-bold leading-snug', compact ? 'text-[0.8125rem]' : 'text-sm')}>
          <Link href={href} className="transition-colors hover:text-brand-600 dark:hover:text-brand-300">
            {prompt.title}
          </Link>
        </h3>

        {!compact && (
          <p className="line-clamp-2 text-xs leading-relaxed text-body">{prompt.shortDescription}</p>
        )}

        <div className="mt-auto flex items-center gap-3 pt-1 text-[0.6875rem] font-medium text-faint">
          <span className="inline-flex items-center gap-1" title={`${prompt.viewCount} views`}>
            <EyeIcon size={13} />
            {formatCompact(prompt.viewCount)}
          </span>
          <span className="inline-flex items-center gap-1" title={`${prompt.copyCount} copies`}>
            <CopyIcon size={13} />
            {formatCompact(prompt.copyCount)}
          </span>
          {!compact && prompt.style && (
            <span className="ml-auto truncate" title={`Style: ${prompt.style}`}>
              {prompt.style}
            </span>
          )}
        </div>

        <div className="pt-0.5">
          <CopyPromptButton
            promptId={prompt.id}
            title={prompt.title}
            locked={locked}
            size="sm"
            fullWidth
            buttonVariant={locked ? 'outline' : 'subtle'}
            label={locked ? 'Unlock to copy' : 'Copy prompt'}
          />
        </div>

        <span className="sr-only">Written for {model.label}</span>
      </div>
    </article>
  );
}

/** Horizontal variant used in "related" rails and dashboard lists. */
export function PromptRow({
  prompt,
  locked,
  meta,
}: {
  prompt: PromptCardData;
  locked?: boolean;
  meta?: string;
}) {
  return (
    <article className="card card-hover group flex gap-3 overflow-hidden p-2.5">
      <Link href={`/prompt/${prompt.slug}`} className="shrink-0" tabIndex={-1} aria-hidden="true">
        <PromptArtwork
          seed={prompt.slug}
          title={prompt.title}
          imageUrl={prompt.coverImageUrl}
          alt={prompt.coverImageAlt}
          ratio="square"
          sizes="88px"
          locked={locked}
          className="w-[5.5rem] rounded-xl"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <div className="flex items-center gap-1.5">
          <ModelBadge model={prompt.aiModel} />
          {prompt.isPremium && <PremiumBadge compact />}
        </div>
        <h3 className="truncate text-[0.8125rem] font-bold">
          <Link href={`/prompt/${prompt.slug}`} className="hover:text-brand-600">
            {prompt.title}
          </Link>
        </h3>
        <p className="truncate text-xs text-faint">{meta ?? prompt.shortDescription}</p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 self-center">
        <FavoriteButton promptId={prompt.id} initialSaved={prompt.savedByMe} compact />
        <LikeButton
          promptId={prompt.id}
          initialLiked={prompt.likedByMe}
          initialCount={prompt.likeCount}
          compact
        />
      </div>
    </article>
  );
}
