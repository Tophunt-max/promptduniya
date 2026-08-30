'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '../ui/button';
import { ShieldIcon } from '../ui/icon';

/**
 * Cookie / privacy notice.
 *
 * We only set strictly-necessary cookies (session + CSRF) by default, so this
 * banner is informational and offers a genuine opt-out of the optional
 * first-party analytics rather than a fake "accept all" gate.
 */

const STORAGE_KEY = 'pd-privacy-choice';

export type PrivacyChoice = 'accepted' | 'essential-only';

export function readPrivacyChoice(): PrivacyChoice | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'accepted' || value === 'essential-only' ? value : null;
  } catch {
    return null;
  }
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Delay slightly so it never competes with first paint / LCP.
    const timer = setTimeout(() => setVisible(readPrivacyChoice() === null), 900);
    return () => clearTimeout(timer);
  }, []);

  function choose(choice: PrivacyChoice) {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      /* private mode — the banner will simply reappear next visit */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Privacy preferences"
      /* Anchored bottom-left rather than centred, and narrow enough to leave the
         middle of the page usable. A centred card sat directly over the prompt
         artwork on a short viewport, which made the first thing a new visitor
         saw a dialog rather than the product. */
      className="fixed inset-x-3 bottom-20 z-[70] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]/97 p-3.5 shadow-[var(--shadow-lift)] backdrop-blur animate-[fade-up_0.3s_cubic-bezier(0.16,1,0.3,1)_both] sm:inset-x-auto sm:left-4 sm:max-w-sm lg:bottom-4"
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300"
        >
          <ShieldIcon size={15} />
        </span>
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-bold">A quick note on privacy</p>
          <p className="mt-1 text-xs leading-relaxed text-body">
            The session cookie that keeps you signed in is essential. We also count page views
            anonymously to see which prompts are useful. No advertising trackers.{' '}
            <Link
              href="/privacy"
              className="font-semibold text-brand-600 underline underline-offset-2 dark:text-brand-300"
            >
              Privacy policy
            </Link>
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => choose('accepted')}>
              That&rsquo;s fine
            </Button>
            <Button size="sm" variant="ghost" onClick={() => choose('essential-only')}>
              Essential only
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
