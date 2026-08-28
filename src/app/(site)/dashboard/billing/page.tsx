import type { Metadata } from 'next';
import Link from 'next/link';

import { DashboardShell, StatCard } from '@/components/dashboard/dashboard-shell';
import { CancelSubscriptionButton } from '@/components/dashboard/cancel-subscription';
import { Badge, PremiumBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { CreditCardIcon, CrownIcon } from '@/components/ui/icon';
import { requireUserPage } from '@/lib/auth/guards';
import { daysUntil, formatDate, formatDateTime } from '@/lib/dates';
import { buildMetadata } from '@/lib/seo';
import { formatMoney } from '@/lib/utils';
import { getAccess } from '@/lib/viewer';
import { listUserPayments } from '@/services/payments';
import { currentSubscription, subscriptionHistory } from '@/services/subscriptions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Premium and billing',
  path: '/dashboard/billing',
  noIndex: true,
});

const STATUS_TONES: Record<string, 'success' | 'rose' | 'marigold' | 'neutral'> = {
  captured: 'success',
  failed: 'rose',
  created: 'marigold',
  refunded: 'neutral',
  partially_refunded: 'neutral',
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const user = await requireUserPage('/dashboard/billing');
  const access = await getAccess();
  const { upgraded } = await searchParams;

  const [subscription, history, payments] = await Promise.all([
    currentSubscription(user.id),
    subscriptionHistory(user.id),
    listUserPayments(user.id),
  ]);

  const remaining = subscription?.endDate ? daysUntil(subscription.endDate) : null;
  const totalPaid = payments
    .filter((payment) => payment.status === 'captured')
    .reduce((sum, payment) => sum + payment.amountMinor, 0);

  return (
    <DashboardShell
      title="Premium and billing"
      description="Your membership, payment history and receipts."
      actions={access.isPremium ? <PremiumBadge /> : null}
    >
      {upgraded === '1' && (
        <div className="card mb-6 border-emerald-300 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-950/25">
          <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
            Welcome to Premium 🎉
          </p>
          <p className="mt-1 text-sm text-body">
            Your limits are lifted and the premium collection is unlocked.
          </p>
        </div>
      )}

      {subscription ? (
        <section aria-labelledby="membership" className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="membership" className="text-lg font-extrabold">
                {subscription.planName} membership
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={subscription.status === 'active' ? 'success' : 'marigold'}>
                  {subscription.status}
                </Badge>
                {subscription.autoRenew ? (
                  <Badge tone="brand">Auto-renew on</Badge>
                ) : (
                  <Badge tone="neutral">Auto-renew off</Badge>
                )}
              </div>
              <dl className="mt-4 grid gap-1.5 text-sm">
                <div className="flex gap-2">
                  <dt className="text-faint">Started</dt>
                  <dd className="font-medium">{formatDate(subscription.startDate)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-faint">
                    {subscription.endDate ? (subscription.autoRenew ? 'Renews' : 'Access until') : 'Expires'}
                  </dt>
                  <dd className="font-medium">
                    {subscription.endDate ? formatDate(subscription.endDate) : 'Never — lifetime plan'}
                    {remaining !== null && remaining > 0 && (
                      <span className="ml-1.5 text-faint">({remaining} days left)</span>
                    )}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-faint">Price</dt>
                  <dd className="font-medium">
                    {formatMoney(subscription.priceMinor, subscription.currency)}
                    {subscription.billingPeriod !== 'lifetime' && ` / ${subscription.billingPeriod}`}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="grid gap-2">
              {subscription.billingPeriod !== 'lifetime' && (
                <ButtonLink href="/premium" variant="outline" size="sm">
                  Change plan
                </ButtonLink>
              )}
              {subscription.autoRenew && (
                <CancelSubscriptionButton endsAt={formatDate(subscription.endDate)} />
              )}
            </div>
          </div>
        </section>
      ) : (
        <EmptyState
          icon={<CrownIcon size={24} />}
          title="You're on the free plan"
          description="Upgrade for unlimited copies, unlimited favourites, the premium prompt collection and the advanced generator."
          action={{ label: 'See premium plans', href: '/premium' }}
        />
      )}

      <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Total paid"
          value={formatMoney(totalPaid)}
          hint={`${payments.filter((p) => p.status === 'captured').length} successful payments`}
          icon={<CreditCardIcon size={16} />}
        />
        <StatCard
          label="Current plan"
          value={subscription?.planName ?? 'Free'}
          hint={access.isPremium ? 'Premium features active' : 'Free tier limits apply'}
        />
        <StatCard
          label="Memberships"
          value={String(history.length)}
          hint="Including past subscriptions"
        />
      </section>

      <section className="mt-9" aria-labelledby="payments">
        <h2 id="payments" className="mb-4 text-base font-bold">
          Payment history
        </h2>

        {payments.length === 0 ? (
          <p className="card p-5 text-sm text-body">
            No payments yet.{' '}
            <Link href="/premium" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
              View premium plans
            </Link>
            .
          </p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
              <caption className="sr-only">Your payment history</caption>
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-left">
                  <th scope="col" className="px-4 py-3 font-bold">Date</th>
                  <th scope="col" className="px-4 py-3 font-bold">Receipt</th>
                  <th scope="col" className="px-4 py-3 font-bold">Method</th>
                  <th scope="col" className="px-4 py-3 font-bold">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-[var(--border-subtle)] last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(payment.createdAt)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{payment.receiptId ?? '—'}</td>
                    <td className="px-4 py-3 capitalize">{payment.method ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONES[payment.status] ?? 'neutral'}>{payment.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {formatMoney(payment.amountMinor, payment.currency)}
                      {payment.discountMinor > 0 && (
                        <span className="ml-1.5 text-xs font-normal text-faint">
                          (−{formatMoney(payment.discountMinor, payment.currency)})
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-faint">
          Need an invoice or have a billing question?{' '}
          <Link href="/contact" className="font-semibold underline">
            Contact us
          </Link>{' '}
          with your receipt number. Refund eligibility is covered in our{' '}
          <Link href="/refund-policy" className="font-semibold underline">
            refund policy
          </Link>
          .
        </p>
      </section>
    </DashboardShell>
  );
}
