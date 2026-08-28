import type { Metadata } from 'next';
import Link from 'next/link';

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { AccountSettings } from '@/components/dashboard/account-settings';
import { requireUserPage } from '@/lib/auth/guards';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Account settings',
  path: '/dashboard/settings',
  noIndex: true,
});

export default async function SettingsPage() {
  await requireUserPage('/dashboard/settings');

  return (
    <DashboardShell
      title="Settings"
      description="Security, appearance and privacy controls for your account."
    >
      <AccountSettings />

      <section className="mt-8" aria-labelledby="privacy">
        <h2 id="privacy" className="mb-3 text-base font-bold">
          Your data
        </h2>
        <div className="card grid gap-3 p-5 text-sm text-body">
          <p>
            We keep the minimum needed to run your account: your name, email, saved prompts and a
            pseudonymised record of daily activity used to enforce plan limits. We do not store raw
            IP addresses, and there are no third-party advertising trackers on this site.
          </p>
          <p>
            To export or delete your account and data, email us from your registered address and we
            will action it. Read the full{' '}
            <Link href="/privacy" className="font-semibold text-brand-600 underline dark:text-brand-300">
              privacy policy
            </Link>{' '}
            for detail on retention periods.
          </p>
          <Link
            href="/contact?subject=Data%20request"
            className="font-semibold text-brand-600 hover:underline dark:text-brand-300"
          >
            Request an export or deletion
          </Link>
        </div>
      </section>
    </DashboardShell>
  );
}
