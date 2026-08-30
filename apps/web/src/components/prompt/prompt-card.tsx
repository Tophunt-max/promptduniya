import Link from 'next/link';

import { aiModel } from '@/lib/constants';
import { cn, formatCompact } from '@/lib/utils';
import type { PromptCardData } from '@/services/prompts';
import {
  EditorsPickBadge,
  InputModeBadge,
  ModelBadge,
  PremiumBadge,
  TrendingBadge,
} from '../ui/badge';
import { CopyIcon, EyeIcon } from '../ui/icon';
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
            category={prompt.categorySlug}
            style={prompt.style}
          />
        </Link>

        {/* Top-left status badges */}
        <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex flex-wrap items-start gap-1.5">
          {prompt.isTrending && <TrendingBadge />}
          {prompt.isPremium && <PremiumBadge compact={compact} />}
          {prompt.isEditorsPick && !compact && !prompt.isTrending && <EditorsPickBadge />}
        </div>

        {/* Bottom-left: "bring your own face". Placed away from the status
            badges because it answers a different question — not how good the
            prompt is, but whether the reader has to do something first. */}
        {prompt.inputMode === 'photo-edit' && (
          <div className="pointer-events-none absolute bottom-2.5 left-2.5">
            <InputModeBadge mode={prompt.inputMode} />
          </div>
        )}

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

        {/* A locked card previously carried four separate premium signals: the
            top-left badge, the blurred artwork, a black pill floating dead centre
            and the "Unlock to copy" button. The centre pill was the redundant
            one — and the worst looking, since it sat as an opaque blob over the
            blur. The other three say it clearly enough. */}
      </div>

      {/* Title first, then supporting metadata.
          Previously the model and category chips sat above the title, so the
          loudest element in the card was a badge and the actual prompt name came
          second at 14px. The title now leads at 15px, and the style — which used
          to be crushed into the right-hand end of the stats row — has moved onto
          the artwork as a caption. */}
      <div className={cn('flex flex-1 flex-col gap-1.5 p-3.5', compact && 'gap-1 p-3')}>
        <h3
          className={cn(
            'font-bold leading-snug tracking-[-0.015em]',
            compact ? 'text-[0.8125rem]' : 'text-[0.9375rem]',
          )}
        >
          <Link
            href={href}
            className="transition-colors hover:text-brand-600 dark:hover:text-brand-300"
          >
            {prompt.title}
          </Link>
        </h3>

        {!compact && (
          <p className="line-clamp-2 text-xs leading-relaxed text-body">
            {prompt.shortDescription}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ModelBadge model={prompt.aiModel} />
          <Link
            href={`/category/${prompt.categorySlug}`}
            className="rounded-full bg-[var(--surface-sunken)] px-2 py-1 text-[0.6875rem] font-semibold text-body transition-colors hover:text-brand-600 dark:hover:text-brand-300"
          >
            {prompt.categoryName}
          </Link>
        </div>

        <div className="mt-auto flex items-center gap-3 pt-2 text-[0.6875rem] font-medium text-faint">
          <span className="inline-flex items-center gap-1" title={`${prompt.viewCount} views`}>
            <EyeIcon size={13} />
            {formatCompact(prompt.viewCount)}
          </span>
          <span className="inline-flex items-center gap-1" title={`${prompt.copyCount} copies`}>
            <CopyIcon size={13} />
            {formatCompact(prompt.copyCount)}
          </span>
          {!compact && prompt.aspectRatio && (
            <span className="ml-auto tabular-nums" title={`Aspect ratio ${prompt.aspectRatio}`}>
              {prompt.aspectRatio}
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
          category={prompt.categorySlug}
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
