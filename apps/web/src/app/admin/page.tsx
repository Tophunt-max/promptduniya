import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminBarList, AdminChart, AdminStat } from '@/components/admin/admin-chart';
import { AdminShell } from '@/components/admin/admin-shell';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { PlusIcon } from '@/components/ui/icon';
import { requireAdminPage } from '@/lib/auth/guards';
import { relativeTime } from '@/lib/dates';
import { formatCompact, formatMoney } from '@/lib/utils';
import {
  dailyPromptCopies,
  dailyPromptViews,
  dailyRevenue,
  dailySignups,
  platformStats,
  topCategories,
  topPrompts,
  topSearches,
} from '@/services/analytics';
import { pendingModerationCounts } from '@/services/admin';
import { adminListPayments } from '@/services/payments';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function AdminDashboardPage() {
  await requireAdminPage();

  const [
    stats,
    views,
    copies,
    signups,
    revenue,
    prompts,
    categories,
    searches,
    moderation,
    payments,
  ] = await Promise.all([
    platformStats(),
    dailyPromptViews(30),
    dailyPromptCopies(30),
    dailySignups(30),
    dailyRevenue(30),
    topPrompts(8),
    topCategories(8),
    topSearches(8, 30),
    pendingModerationCounts(),
    adminListPayments({ pageSize: 6 }),
  ]);

  return (
    <AdminShell
      title="Dashboard"
      description="Traffic, engagement and revenue at a glance."
      pendingCount={moderation.openReports + moderation.pendingComments}
      actions={
        <ButtonLink href="/admin/prompts/new" size="sm" leadingIcon={<PlusIcon size={15} />}>
          New prompt
        </ButtonLink>
      }
    >
      <section aria-label="Audience" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStat
          label="Total users"
          value={formatCompact(stats.totalUsers)}
          hint={`${stats.newUsers7d} new in 7 days`}
        />
        <AdminStat
          label="Active (30d)"
          value={formatCompact(stats.activeUsers30d)}
          hint="Signed in within 30 days"
        />
        <AdminStat
          label="Premium members"
          value={formatCompact(stats.premiumUsers)}
          hint="Active subscriptions"
          tone="positive"
        />
        <AdminStat
          label="Revenue (30d)"
          value={formatMoney(stats.mrrMinor)}
          hint={`${formatMoney(stats.totalRevenueMinor)} all time`}
          tone="positive"
        />
      </section>

      <section aria-label="Content" className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStat
          label="Published prompts"
          value={formatCompact(stats.publishedPrompts)}
          hint={`${stats.totalPrompts} total, ${stats.premiumPrompts} premium`}
        />
        <AdminStat label="Prompt views" value={formatCompact(stats.promptViews)} />
        <AdminStat label="Prompt copies" value={formatCompact(stats.promptCopies)} />
        <AdminStat
          label="Generator runs"
          value={formatCompact(stats.generatorRuns)}
          hint={`${formatCompact(stats.totalLikes)} likes · ${formatCompact(stats.totalFavorites)} saves`}
        />
      </section>

      <section aria-label="Trends" className="mt-6 grid gap-3 lg:grid-cols-2">
        <AdminChart title="Prompt views" data={views} accent="brand" />
        <AdminChart title="Prompt copies" data={copies} accent="teal" />
        <AdminChart title="New registrations" data={signups} accent="marigold" />
        <AdminChart
          title="Revenue"
          data={revenue}
          accent="rose"
          format={(value) => formatMoney(value)}
        />
      </section>

      <section aria-label="Leaderboards" className="mt-3 grid gap-3 lg:grid-cols-3">
        <AdminBarList
          title="Top prompts by views"
          items={prompts.map((prompt) => ({
            label: prompt.title,
            value: prompt.views,
            href: `/prompt/${prompt.slug}`,
          }))}
        />
        <AdminBarList
          title="Top categories"
          items={categories.map((category) => ({
            label: category.name,
            value: category.promptCount,
            href: `/category/${category.slug}`,
          }))}
          emptyLabel="No categories yet"
        />
        <AdminBarList
          title="Top searches (30d)"
          items={searches.map((search) => ({ label: search.term, value: search.hits }))}
          emptyLabel="No searches recorded yet"
        />
      </section>

      <section className="mt-6 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold">Recent payments</h2>
            <Link
              href="/admin/payments"
              className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
            >
              View all
            </Link>
          </div>
          {payments.items.length === 0 ? (
            <p className="text-sm text-faint">No payments recorded yet.</p>
          ) : (
            <ul className="grid gap-2.5">
              {payments.items.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{payment.userName ?? payment.userEmail}</p>
                    <p className="text-xs text-faint">{relativeTime(payment.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      tone={
                        payment.status === 'captured'
                          ? 'success'
                          : payment.status === 'failed'
                            ? 'rose'
                            : 'marigold'
                      }
                    >
                      {payment.status}
                    </Badge>
                    <span className="font-bold tabular-nums">
                      {formatMoney(payment.amountMinor, payment.currency)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-bold">Needs your attention</h2>
          <ul className="grid gap-2.5 text-sm">
            <AttentionRow
              label="Open reports"
              value={moderation.openReports}
              href="/admin/moderation"
            />
            <AttentionRow
              label="Comments awaiting review"
              value={moderation.pendingComments}
              href="/admin/moderation?tab=comments"
            />
            <AttentionRow
              label="Unread contact messages"
              value={moderation.newMessages}
              href="/admin/messages"
            />
            <AttentionRow
              label="Failed payments"
              value={stats.failedPayments}
              href="/admin/payments?status=failed"
            />
            <AttentionRow
              label="Unpublished drafts"
              value={stats.totalPrompts - stats.publishedPrompts}
              href="/admin/prompts?status=draft"
            />
          </ul>
        </div>
      </section>
    </AdminShell>
  );
}

function AttentionRow({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--surface-sunken)]"
      >
        <span>{label}</span>
        <span
          className={
            value > 0
              ? 'font-bold text-rose-600 tabular-nums dark:text-rose-400'
              : 'font-bold text-faint tabular-nums'
          }
        >
          {value}
        </span>
      </Link>
    </li>
  );
}
