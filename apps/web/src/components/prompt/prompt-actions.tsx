'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, type ReactNode } from 'react';

import { ApiClientError, api, copyToClipboard, downloadTextFile } from '@/lib/client-api';
import { cn, formatCompact } from '@/lib/utils';
import { useViewer } from '../viewer-provider';
import { Button } from '../ui/button';
import { useToast } from '../ui/toast';
import {
  BookmarkIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FileTextIcon,
  HeartIcon,
  LockIcon,
} from '../ui/icon';

/**
 * Prompt interactions.
 *
 * None of these components hold the prompt body. "Copy" asks the server for the
 * text, which is where the premium check and the daily quota are enforced — so
 * a locked prompt is never present in the page payload.
 */

interface CopyResponse {
  promptText: string;
  negativePrompt: string | null;
  usageInstructions: string | null;
  formatted?: string;
  usage: { used: number; limit: number; remaining: number; unlimited: boolean };
  copyCount: number;
}

function useLimitToast() {
  const toast = useToast();
  const router = useRouter();

  return useCallback(
    (error: unknown, fallback: string) => {
      if (error instanceof ApiClientError) {
        if (error.status === 401) {
          toast.error('Sign in to continue', error.message, {
            label: 'Sign in',
            href: '/login',
          });
          return;
        }
        const upgrade = error.upgradeHref;
        toast.error(
          error.isLimit ? 'Daily limit reached' : 'Something went wrong',
          error.message,
          upgrade ? { label: 'See plans', href: upgrade } : undefined,
        );
        if (error.isLimit) router.refresh();
        return;
      }
      toast.error('Something went wrong', fallback);
    },
    [toast, router],
  );
}

/* -------------------------------- CopyButton ------------------------------- */

export interface CopyPromptButtonProps {
  promptId: string;
  title: string;
  variant?: 'plain' | 'instructions';
  locked?: boolean;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  buttonVariant?: 'primary' | 'outline' | 'subtle' | 'secondary';
  label?: string;
  className?: string;
  onCopied?: (payload: CopyResponse) => void;
}

export function CopyPromptButton({
  promptId,
  title,
  variant = 'plain',
  locked,
  size = 'md',
  fullWidth,
  buttonVariant = 'primary',
  label,
  className,
  onCopied,
}: CopyPromptButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const toast = useToast();
  const handleError = useLimitToast();
  const router = useRouter();

  const defaultLabel = variant === 'instructions' ? 'Copy with instructions' : 'Copy prompt';

  async function run() {
    if (locked) {
      toast.error(
        'Premium prompt',
        'Upgrade your membership to copy this prompt.',
        { label: 'See plans', href: '/premium' },
      );
      return;
    }

    setState('loading');
    try {
      const data = await api.post<CopyResponse>('/api/prompts/copy', { promptId, variant });
      const text = variant === 'instructions' ? data.formatted ?? data.promptText : data.promptText;
      const copied = await copyToClipboard(text);

      if (copied) {
        setState('done');
        const remaining = data.usage.unlimited
          ? undefined
          : `${data.usage.remaining} of ${data.usage.limit} copies left today`;
        toast.success('Prompt copied successfully', remaining);
        setTimeout(() => setState('idle'), 2000);
      } else {
        setState('idle');
        toast.info('Copy manually', 'Your browser blocked clipboard access — select the text instead.');
      }

      onCopied?.(data);
      router.refresh();
    } catch (error) {
      setState('idle');
      handleError(error, 'Could not copy the prompt.');
    }
  }

  return (
    <Button
      onClick={run}
      loading={state === 'loading'}
      size={size}
      fullWidth={fullWidth}
      variant={locked ? 'outline' : buttonVariant}
      className={className}
      aria-label={`${defaultLabel}: ${title}`}
      leadingIcon={
        locked ? (
          <LockIcon size={16} />
        ) : state === 'done' ? (
          <CheckIcon size={16} className="animate-[pop_0.22s_ease-out]" />
        ) : variant === 'instructions' ? (
          <FileTextIcon size={16} />
        ) : (
          <CopyIcon size={16} />
        )
      }
    >
      {state === 'done' ? 'Copied!' : label ?? defaultLabel}
    </Button>
  );
}

/* ------------------------------ DownloadButton ----------------------------- */

export function DownloadPromptButton({
  promptId,
  title,
  slug,
  locked,
}: {
  promptId: string;
  title: string;
  slug: string;
  locked?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const handleError = useLimitToast();

  async function run() {
    if (locked) {
      toast.error('Premium prompt', 'Upgrade to download this prompt.', {
        label: 'See plans',
        href: '/premium',
      });
      return;
    }

    setLoading(true);
    try {
      const data = await api.post<CopyResponse>('/api/prompts/copy', {
        promptId,
        variant: 'download',
      });
      downloadTextFile(`${slug}.txt`, data.formatted ?? data.promptText);
      toast.success('Download started', `${title}.txt`);
    } catch (error) {
      handleError(error, 'Could not download the prompt.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      onClick={run}
      loading={loading}
      variant="outline"
      leadingIcon={locked ? <LockIcon size={16} /> : <DownloadIcon size={16} />}
    >
      Download
    </Button>
  );
}

/* -------------------------------- LikeButton ------------------------------- */

export function LikeButton({
  promptId,
  initialLiked,
  initialCount,
  compact,
  className,
}: {
  promptId: string;
  initialLiked?: boolean;
  initialCount: number;
  compact?: boolean;
  className?: string;
}) {
  const viewer = useViewer();
  const [liked, setLiked] = useState(Boolean(initialLiked));
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const handleError = useLimitToast();

  async function toggle() {
    if (!viewer.isAuthenticated) {
      toast.error('Sign in to like prompts', 'Likes help surface the best prompts.', {
        label: 'Sign in',
        href: '/login',
      });
      return;
    }

    // Optimistic update, rolled back if the request fails.
    const previous = { liked, count };
    setLiked(!liked);
    setCount(count + (liked ? -1 : 1));
    setPending(true);

    try {
      const data = await api.post<{ liked: boolean; likeCount: number }>('/api/prompts/like', {
        promptId,
      });
      setLiked(data.liked);
      setCount(data.likeCount);
    } catch (error) {
      setLiked(previous.liked);
      setCount(previous.count);
      handleError(error, 'Could not update your like.');
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={liked}
      aria-label={liked ? 'Remove like' : 'Like this prompt'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full text-xs font-semibold transition-colors',
        compact ? 'px-2 py-1.5' : 'h-10 px-3',
        liked
          ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300'
          : 'text-body hover:bg-[var(--surface-sunken)] hover:text-rose-600',
        className,
      )}
    >
      <HeartIcon size={16} filled={liked} className={liked ? 'animate-[pop_0.22s_ease-out]' : ''} />
      {count > 0 && <span className="tabular-nums">{formatCompact(count)}</span>}
    </button>
  );
}

/* ------------------------------ FavoriteButton ----------------------------- */

export function FavoriteButton({
  promptId,
  initialSaved,
  compact,
  showLabel,
  className,
}: {
  promptId: string;
  initialSaved?: boolean;
  compact?: boolean;
  showLabel?: boolean;
  className?: string;
}) {
  const viewer = useViewer();
  const [saved, setSaved] = useState(Boolean(initialSaved));
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const handleError = useLimitToast();
  const router = useRouter();

  async function toggle() {
    if (!viewer.isAuthenticated) {
      toast.error('Sign in to save prompts', 'Create a free account to build your collection.', {
        label: 'Sign up free',
        href: '/register',
      });
      return;
    }

    const previous = saved;
    setSaved(!saved);
    setPending(true);

    try {
      const data = await api.post<{ saved: boolean; usage: { limit: number; used: number; unlimited: boolean } }>(
        '/api/prompts/favorite',
        { promptId },
      );
      setSaved(data.saved);
      if (data.saved) {
        toast.success(
          'Saved to favourites',
          data.usage.unlimited
            ? undefined
            : `${data.usage.used} of ${data.usage.limit} saved prompts used`,
        );
      } else {
        toast.info('Removed from favourites');
      }
      router.refresh();
    } catch (error) {
      setSaved(previous);
      handleError(error, 'Could not update your favourites.');
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from favourites' : 'Save to favourites'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full text-xs font-semibold transition-colors',
        compact ? 'px-2 py-1.5' : 'h-10 px-3',
        saved
          ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300'
          : 'text-body hover:bg-[var(--surface-sunken)] hover:text-brand-600',
        className,
      )}
    >
      <BookmarkIcon
        size={16}
        filled={saved}
        className={saved ? 'animate-[pop_0.22s_ease-out]' : ''}
      />
      {showLabel && <span>{saved ? 'Saved' : 'Save'}</span>}
    </button>
  );
}

/* -------------------------------- Icon shell ------------------------------- */

export function ActionIconShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)]/95 p-0.5 backdrop-blur',
        className,
      )}
    >
      {children}
    </div>
  );
}
