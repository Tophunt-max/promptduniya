import { useState } from 'react';

import { BarChart, BarList, LineChart, Sparkline, type Series } from '@/components/chart';
import {
  Alert,
  Card,
  EmptyState,
  PageHeader,
  Select,
  Spinner,
  formatMoney,
  formatNumber,
} from '@/components/ui';
import { useQuery } from '@/lib/use-api';

/**
 * Analytics.
 *
 * The dashboard already showed four sparklines, and its own request was returning
 * ten fields — `promptViews`, `revenue`, `conversions` and `topCategories` were
 * fetched on every load and thrown away, because there was nowhere sensible to put
 * a ranked comparison or a currency series among a row of small trend cards.
 *
 * This screen is that somewhere. It pairs measures that only mean something
 * together (views against copies is a conversion rate; page views against unique
 * visitors is pages-per-session) and gives the ranked data the horizontal bars it
 * needs.
 *
 * It deliberately calls `/v1/admin/analytics` rather than the dashboard's
 * `/stats/series`. That endpoint runs eleven series and six leaderboards, which is
 * the right cost for a screen someone chose to open and the wrong cost for the
 * console's landing page.
 */

interface AnalyticsResponse {
  days: number;
  series: {
    pageViews: Series;
    visitors: Series;
    promptViews: Series;
    promptCopies: Series;
    favorites: Series;
    likes: Series;
    generatorUsage: Series;
    signups: Series;
    revenue: Series;
    conversions: Series;
  };
  leaderboards: {
    topPrompts: { id: string; title: string; slug: string; views: number; copies: number; likes: number }[];
    topSearches: { term: string; hits: number }[];
    topCategories: { id: string; name: string; slug: string; promptCount: number }[];
    topTags: { id: string; name: string; slug: string; usageCount: number }[];
    topReferrers: { host: string; hits: number }[];
    topPages: { path: string; hits: number }[];
  };
}

const RANGES = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 365, label: 'Last 12 months' },
];

function total(series: Series | undefined): number {
  return (series?.values ?? []).reduce((sum, value) => sum + value, 0);
}

/** Money is stored in paise; the axis and tooltips need rupees. */
const money = (minor: number) => formatMoney(minor);

export function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const analytics = useQuery<AnalyticsResponse>(`/v1/admin/analytics?days=${days}`, [days]);

  if (analytics.loading && !analytics.data) return <Spinner label="Crunching numbers" />;
  if (analytics.error) return <Alert>{analytics.error}</Alert>;
  if (!analytics.data) return <EmptyState>No analytics yet.</EmptyState>;

  const { series, leaderboards } = analytics.data;

  const views = total(series.promptViews);
  const copies = total(series.promptCopies);
  const visitors = total(series.visitors);
  const pageViews = total(series.pageViews);

  // The two ratios worth putting in front of someone. Copy rate is the closest
  // thing this product has to a conversion metric — a reader who copies a prompt
  // got what they came for.
  const copyRate = views > 0 ? (copies / views) * 100 : 0;
  const pagesPerVisitor = visitors > 0 ? pageViews / visitors : 0;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Traffic, engagement and revenue over the selected window."
        actions={
          <Select
            value={String(days)}
            onChange={(event) => setDays(Number(event.target.value))}
            className="w-auto min-w-40"
          >
            {RANGES.map((range) => (
              <option key={range.days} value={range.days}>
                {range.label}
              </option>
            ))}
          </Select>
        }
      />

      {/* Headline trends. Sparklines here rather than full charts because the job
          of this row is comparison at a glance, not reading values. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Sparkline series={series.visitors} label="Unique visitors" />
        <Sparkline series={series.pageViews} label="Page views" />
        <Sparkline series={series.promptCopies} label="Prompt copies" />
        <Sparkline series={series.signups} label="New members" />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Ratio
          label="Copy rate"
          value={`${copyRate.toFixed(1)}%`}
          hint={`${formatNumber(copies)} copies from ${formatNumber(views)} prompt views`}
        />
        <Ratio
          label="Pages per visitor"
          value={pagesPerVisitor.toFixed(2)}
          hint={`${formatNumber(pageViews)} views from ${formatNumber(visitors)} visitors`}
        />
        <Ratio
          label="Saves"
          value={formatNumber(total(series.favorites))}
          hint={`${formatNumber(total(series.likes))} likes in the same window`}
        />
        <Ratio
          label="Revenue"
          value={money(total(series.revenue))}
          hint={`${formatNumber(total(series.conversions))} subscriptions started`}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card
          title="Traffic"
          description="Page views against unique visitors. The gap between them is depth of browsing."
        >
          <LineChart
            data={[
              { name: 'Page views', series: series.pageViews },
              { name: 'Unique visitors', series: series.visitors },
            ]}
          />
        </Card>

        <Card
          title="Prompt engagement"
          description="Views against copies. A widening gap means readers are looking but not taking."
        >
          <LineChart
            data={[
              { name: 'Prompt views', series: series.promptViews },
              { name: 'Copies', series: series.promptCopies, color: '#10b981' },
            ]}
          />
        </Card>

        <Card title="Saves and likes" description="Signals that a prompt was worth keeping.">
          <LineChart
            data={[
              { name: 'Favourites', series: series.favorites, color: '#8b5cf6' },
              { name: 'Likes', series: series.likes, color: '#f59e0b' },
            ]}
          />
        </Card>

        <Card title="Generator usage" description="Runs of the public prompt generator.">
          <LineChart data={[{ name: 'Generator runs', series: series.generatorUsage }]} />
        </Card>

        <Card
          title="Revenue"
          description="Captured payments per day. Bars, because a payment is a discrete event."
        >
          <BarChart series={series.revenue} format={money} color="#10b981" />
        </Card>

        <Card
          title="Growth"
          description="Signups and the subscriptions that followed."
        >
          <LineChart
            data={[
              { name: 'Signups', series: series.signups },
              { name: 'Subscriptions', series: series.conversions, color: '#10b981' },
            ]}
          />
        </Card>
      </div>

      <h2 className="mt-8 mb-3 text-sm font-bold text-[var(--text-strong)]">Leaderboards</h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Most viewed prompts">
          <BarList
            items={leaderboards.topPrompts.map((prompt) => ({
              label: prompt.title,
              value: prompt.views,
              hint: `${formatNumber(prompt.copies)} copies`,
            }))}
            emptyLabel="No prompt activity yet."
          />
        </Card>

        <Card title="Top searches" description="What readers typed into the search box.">
          <BarList
            items={leaderboards.topSearches.map((search) => ({
              label: search.term,
              value: search.hits,
            }))}
            emptyLabel="No searches recorded yet."
          />
        </Card>

        <Card title="Categories by size" description="Published prompts per category.">
          <BarList
            items={leaderboards.topCategories.map((category) => ({
              label: category.name,
              value: category.promptCount,
            }))}
            emptyLabel="No categories yet."
            color="#0ea5e9"
          />
        </Card>

        <Card
          title="Tags by usage"
          description="Prompts carrying each tag. Manage them on the Tags screen."
        >
          <BarList
            items={leaderboards.topTags.map((tag) => ({
              label: tag.name,
              value: tag.usageCount,
            }))}
            emptyLabel="No tags in use yet."
            color="#8b5cf6"
          />
        </Card>

        <Card title="Most visited pages">
          <BarList
            items={leaderboards.topPages.map((page) => ({
              label: page.path,
              value: page.hits,
            }))}
            emptyLabel="No page views recorded yet."
            color="#f59e0b"
          />
        </Card>

        <Card title="Referrers" description="Grouped by host. Direct traffic is not counted here.">
          <BarList
            items={leaderboards.topReferrers.map((referrer) => ({
              label: referrer.host,
              value: referrer.hits,
            }))}
            emptyLabel="No referrers recorded yet."
            color="#ef4444"
          />
        </Card>
      </div>
    </>
  );
}

/** A derived figure with the arithmetic behind it spelled out underneath. */
function Ratio({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card p-4">
      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="tabular mt-1.5 text-[1.5rem] font-bold leading-none text-[var(--text-strong)]">
        {value}
      </p>
      <p className="mt-1.5 text-xs text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}
