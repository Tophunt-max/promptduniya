import type { Metadata } from 'next';
import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { ButtonLink } from '@/components/ui/button';
import { LockIcon } from '@/components/ui/icon';
import { buildMetadata } from '@/lib/seo';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Access denied',
  path: '/403',
  noIndex: true,
});

/** Shown when an authenticated user lacks the role for a page. */
export default async function ForbiddenPage() {
  const user = await getCurrentUser();

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-12 text-center">
      <div aria-hidden="true" className="hero-mesh opacity-60" />

      <div className="relative w-full max-w-lg">
        <Logo size={36} href="/" className="mx-auto mb-9" />

        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-marigold-50 text-marigold-600 dark:bg-marigold-900/40 dark:text-marigold-300">
          <LockIcon size={26} />
        </span>

        <h1 className="mt-5 text-2xl font-extrabold">You don&rsquo;t have access to this page</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-body">
          {user
            ? `You're signed in as ${user.email}, but this area needs additional permissions. If you believe that's wrong, ask an administrator to check your role.`
            : 'This area is restricted. Sign in with an account that has the right permissions.'}
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          {user ? (
            <ButtonLink href="/dashboard">Go to your dashboard</ButtonLink>
          ) : (
            <ButtonLink href="/login">Sign in</ButtonLink>
          )}
          <ButtonLink href="/" variant="outline">
            Back to home
          </ButtonLink>
        </div>

        <p className="mt-6 text-xs text-faint">
          Need help?{' '}
          <Link href="/contact" className="font-semibold underline">
            Contact support
          </Link>
        </p>
      </div>
    </div>
  );
}
