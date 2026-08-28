'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { Logo } from '@/components/brand/logo';
import { Button, ButtonLink } from '@/components/ui/button';
import { AlertIcon, RefreshIcon } from '@/components/ui/icon';

/**
 * Route-level error boundary.
 *
 * Shows a recovery action rather than a stack trace. Error details are logged to
 * the console for the developer and never rendered to the visitor.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app] unhandled error:', error);
  }, [error]);

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-12 text-center">
      <div aria-hidden="true" className="hero-mesh opacity-60" />

      <div className="relative w-full max-w-lg">
        <Logo size={36} href="/" className="mx-auto mb-9" />

        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
          <AlertIcon size={26} />
        </span>

        <h1 className="mt-5 text-2xl font-extrabold">Something went wrong</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-body">
          An unexpected error stopped this page from loading. Trying again usually fixes it — if it
          keeps happening, let us know and we will look into it.
        </p>

        {error.digest && (
          <p className="mt-4 font-mono text-xs text-faint">Reference: {error.digest}</p>
        )}

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <Button onClick={reset} leadingIcon={<RefreshIcon size={17} />}>
            Try again
          </Button>
          <ButtonLink href="/" variant="outline">
            Back to home
          </ButtonLink>
        </div>

        <p className="mt-6 text-xs text-faint">
          Still stuck?{' '}
          <Link href="/contact" className="font-semibold underline">
            Contact support
          </Link>
        </p>
      </div>
    </div>
  );
}
