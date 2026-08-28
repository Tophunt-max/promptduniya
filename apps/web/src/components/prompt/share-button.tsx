'use client';

import { useState } from 'react';

import { copyToClipboard } from '@/lib/client-api';
import { publicEnv } from '@/lib/env-public';
import { cn } from '@/lib/utils';
import { Modal } from '../ui/modal';
import { useToast } from '../ui/toast';
import {
  CheckIcon,
  FacebookIcon,
  LinkIcon,
  ShareIcon,
  TelegramIcon,
  WhatsAppIcon,
  XIcon,
} from '../ui/icon';

/**
 * Social sharing.
 *
 * Uses the native Web Share sheet when the browser supports it (most mobile
 * devices) and falls back to an accessible dialog with per-network links.
 */

export interface ShareButtonProps {
  title: string;
  path: string;
  description?: string;
  variant?: 'button' | 'icon';
  className?: string;
}

export function ShareButton({
  title,
  path,
  description,
  variant = 'button',
  className,
}: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const url = `${publicEnv.siteUrl}${path}`;
  const shareText = `${title} — ${description ?? 'AI prompt on promptduniya'}`;

  async function onShare() {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title, text: shareText, url });
        return;
      } catch (error) {
        // AbortError means the user dismissed the native sheet — stay silent.
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }
    setOpen(true);
  }

  async function onCopyLink() {
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Could not copy the link');
    }
  }

  const targets = [
    {
      label: 'WhatsApp',
      icon: <WhatsAppIcon size={18} />,
      href: `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${url}`)}`,
      tone: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Telegram',
      icon: <TelegramIcon size={18} />,
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`,
      tone: 'text-sky-600 dark:text-sky-400',
    },
    {
      label: 'X',
      icon: <XIcon size={18} />,
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`,
      tone: 'text-[var(--text-primary)]',
    },
    {
      label: 'Facebook',
      icon: <FacebookIcon size={18} />,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      tone: 'text-blue-600 dark:text-blue-400',
    },
  ];

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={onShare}
          aria-label={`Share ${title}`}
          className={cn(
            'grid size-10 place-items-center rounded-full text-body transition-colors hover:bg-[var(--surface-sunken)] hover:text-brand-600',
            className,
          )}
        >
          <ShareIcon size={16} />
        </button>
      ) : (
        <button
          type="button"
          onClick={onShare}
          className={cn(
            'inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold transition-colors hover:border-brand-500 hover:text-brand-600',
            className,
          )}
        >
          <ShareIcon size={16} />
          Share
        </button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Share this prompt"
        description={title}
        size="sm"
        sheet
      >
        <div className="grid gap-2">
          <div className="grid grid-cols-4 gap-2">
            {targets.map((target) => (
              <a
                key={target.label}
                href={target.href}
                target="_blank"
                rel="noopener noreferrer"
                className="grid gap-1.5 rounded-xl border border-[var(--border-subtle)] px-2 py-3 text-center text-[0.6875rem] font-semibold transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-sunken)]"
              >
                <span className={cn('mx-auto', target.tone)}>{target.icon}</span>
                {target.label}
              </a>
            ))}
          </div>

          <button
            type="button"
            onClick={onCopyLink}
            className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] px-3.5 py-3 text-left transition-colors hover:border-[var(--border-strong)]"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Copy link</span>
              <span className="block truncate text-xs text-faint">{url}</span>
            </span>
            <span className="shrink-0 text-brand-600 dark:text-brand-300">
              {copied ? <CheckIcon size={18} /> : <LinkIcon size={18} />}
            </span>
          </button>
        </div>
      </Modal>
    </>
  );
}
