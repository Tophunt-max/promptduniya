'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '../ui/button';

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
      className="fixed inset-x-3 bottom-20 z-[70] mx-auto max-w-xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-lift)] animate-[fade-up_0.3s_cubic-bezier(0.16,1,0.3,1)_both] lg:bottom-5"
    >
      <p className="text-sm font-bold">A quick note on privacy</p>
      <p className="mt-1.5 text-xs leading-relaxed text-body">
        We use a session cookie to keep you signed in — that one is essential. We also record
        anonymous, aggregated page counts to understand which prompts are useful. No third-party
        advertising trackers.{' '}
        <Link href="/privacy" className="font-semibold text-brand-600 underline underline-offset-2 dark:text-brand-300">
          Read the privacy policy
        </Link>
        .
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => choose('accepted')}>
          That&rsquo;s fine
        </Button>
        <Button size="sm" variant="outline" onClick={() => choose('essential-only')}>
          Essential cookies only
        </Button>
      </div>
    </div>
  );
}
