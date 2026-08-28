import type { Metadata } from 'next';

import { Logo } from '@/components/brand/logo';
import { ButtonLink } from '@/components/ui/button';
import { AlertIcon } from '@/components/ui/icon';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'You are offline',
  path: '/offline',
  noIndex: true,
});

/**
 * Offline fallback served by the service worker when a navigation fails.
 *
 * Intentionally static and dependency-free: it must render from cache with no
 * network and no account data.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-12 text-center">
      <div className="w-full max-w-md">
        <Logo size={36} href="/" className="mx-auto mb-9" />

        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-marigold-50 text-marigold-600 dark:bg-marigold-900/40 dark:text-marigold-300">
          <AlertIcon size={26} />
        </span>

        <h1 className="mt-5 text-2xl font-extrabold">You&rsquo;re offline</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-body">
          This page needs a connection. Reconnect and try again — anything you had already loaded is
          still in your browser history.
        </p>

        <div className="mt-7">
          <ButtonLink href="/">Try again</ButtonLink>
        </div>

        <p className="mt-6 text-xs text-faint">
          For your security we never cache prompt bodies, account details or payment pages offline.
        </p>
      </div>
    </div>
  );
}
