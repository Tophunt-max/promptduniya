import type { Metadata } from 'next';

import { AdminBarList, AdminChart, AdminStat } from '@/components/admin/admin-chart';
import { AdminShell } from '@/components/admin/admin-shell';
import { requireAdminPage } from '@/lib/auth/guards';
import { formatCompact, formatMoney } from '@/lib/utils';
import {
  dailyGeneratorUsage,
  dailyPremiumConversions,
  dailyPromptCopies,
  dailyPromptViews,
  dailyRevenue,
  dailySignups,
  dailyVisitors,
  platformStats,
  topCategories,
  topPrompts,
  topSearches,
} from '@/services/analytics';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Analytics' };

export default async function AdminAnalyticsPage() {
  await requireAdminPage();

  const [
    stats,
    visitors,
    views,
    copies,
    generator,
    signups,
    conversions,
    revenue,
    prompts,
    categories,
    searches,
  ] = await Promise.all([
    platformStats(),
    dailyVisitors(30),
    dailyPromptViews(30),
    dailyPromptCopies(30),
    dailyGeneratorUsage(30),
    dailySignups(30),
    dailyPremiumConversions(30),
    dailyRevenue(30),
    topPrompts(10),
    topCategories(10),
    topSearches(10, 30),
  ]);

  const conversionRate =
    stats.totalUsers > 0 ? ((stats.premiumUsers / stats.totalUsers) * 100).toFixed(1) : '0.0';
  const copyRate =
    stats.promptViews > 0 ? ((stats.promptCopies / stats.promptViews) * 100).toFixed(1) : '0.0';

  return (
    <AdminShell
      title="Analytics"
      description="Aggregated, pseudonymous metrics over the last 30 days. No raw IP addresses are stored."
    >
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStat
          label="Premium conversion"
          value={`${conversionRate}%`}
          hint={`${stats.premiumUsers} of ${stats.totalUsers} users`}
          tone="positive"
        />
        <AdminStat
          label="View to copy rate"
          value={`${copyRate}%`}
          hint={`${formatCompact(stats.promptCopies)} copies from ${formatCompact(stats.promptViews)} views`}
        />
        <AdminStat
          label="Generator runs"
          value={formatCompact(stats.generatorRuns)}
          hint="All time"
        />
        <AdminStat
          label="Revenue (30d)"
          value={formatMoney(stats.mrrMinor)}
          hint={`${formatMoney(stats.totalRevenueMinor)} all time`}
          tone="positive"
        />
      </section>

      <section className="mt-6 grid gap-3 lg:grid-cols-2">
        <AdminChart title="Daily visitors (unique)" data={visitors} accent="brand" />
        <AdminChart title="Daily prompt views" data={views} accent="brand" />
        <AdminChart title="Daily prompt copies" data={copies} accent="teal" />
        <AdminChart title="Generator usage" data={generator} accent="teal" />
        <AdminChart title="New registrations" data={signups} accent="marigold" />
        <AdminChart title="Premium conversions" data={conversions} accent="marigold" />
        <AdminChart
          title="Revenue"
          data={revenue}
          accent="rose"
          format={(value) => formatMoney(value)}
          className="lg:col-span-2"
        />
      </section>

      <section className="mt-3 grid gap-3 lg:grid-cols-3">
        <AdminBarList
          title="Top prompts by views"
          items={prompts.map((p) => ({ label: p.title, value: p.views, href: `/prompt/${p.slug}` }))}
        />
        <AdminBarList
          title="Top prompts by copies"
          items={[...prompts]
            .sort((a, b) => b.copies - a.copies)
            .map((p) => ({ label: p.title, value: p.copies, href: `/prompt/${p.slug}` }))}
        />
        <AdminBarList
          title="Top categories"
          items={categories.map((c) => ({
            label: c.name,
            value: c.promptCount,
            href: `/category/${c.slug}`,
          }))}
        />
      </section>

      <section className="mt-3">
        <AdminBarList
          title="Top search terms (30 days)"
          items={searches.map((s) => ({
            label: s.term,
            value: s.hits,
            href: `/search?q=${encodeURIComponent(s.term)}`,
          }))}
          emptyLabel="No searches recorded in this window."
        />
      </section>
    </AdminShell>
  );
}
