import type { Metadata } from 'next';

import { requireAdminPage } from '@/lib/auth/guards';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · promptduniya admin' },
  // The admin panel must never be indexed.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Admin route group.
 *
 * `requireAdminPage` runs before anything renders, so an unauthenticated or
 * non-privileged visitor is redirected rather than being served the shell.
 * Individual pages that mutate money or roles additionally require the strict
 * `admin` role, and every API handler re-checks server-side.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
