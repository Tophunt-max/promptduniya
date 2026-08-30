import { Link } from 'react-router-dom';

import { BarList, Sparkline } from '@/components/chart';
import {
  Alert,
  Badge,
  Card,
  PageHeader,
  Spinner,
  cn,
  formatMoney,
  formatNumber,
} from '@/components/ui';
import {
  CopyIcon,
  CrownIcon,
  EyeIcon,
  PromptsIcon,
  RupeeIcon,
  SettingsIcon,
  TrendUpIcon,
  UsersIcon,
  type IconProps,
} from '@/components/icons';
import { useQuery } from '@/lib/use-api';

interface PlatformStats {
  totalUsers: number;
  newUsers7d: number;
  activeUsers30d: number;
  premiumUsers: number;
  mrrMinor: number;
  totalRevenueMinor: number;
  successfulPayments: number;
  failedPayments: number;
  totalPrompts: number;
  publishedPrompts: number;
  premiumPrompts: number;
  promptViews: number;
  promptCopies: number;
  totalLikes: number;
  totalFavorites: number;
  generatorRuns: number;
}

interface DailySeries {
  labels: string[];
  values: number[];
}

interface SeriesResponse {
  visitors: DailySeries;
  promptViews: DailySeries;
  promptCopies: DailySeries;
  generatorUsage: DailySeries;
  signups: DailySeries;
  revenue: DailySeries;
  conversions: DailySeries;
  topPrompts: { id: string; title: string; slug: string; views: number; copies: number; likes: number }[];
  topSearches: { term: string; hits: number }[];
  topCategories: { id: string; name: string; slug: string; promptCount: number }[];
}

interface ModerationCounts {
  openReports: number;
  pendingComments: number;
  newMessages: number;
}

/**
 * Metric tile.
 *
 * The icon is the point of the redesign: twelve of these in a grid used to be
 * twelve identical rectangles of text, so finding "Revenue" meant reading every
 * label. A tinted glyph gives each one a shape the eye can pick out, and the
 * value now leads at the size the label used to share.
 */
function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'brand',
}: {
  label: string;
  value: string;
  hint?: string;
  icon: (props: IconProps) => React.ReactElement;
  tone?: 'brand' | 'emerald' | 'amber' | 'rose';
}) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300',
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {label}
        </p>
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', tones[tone])}>
          <Icon size={16} />
        </span>
      </div>
      <p className="tabular mt-2 text-[1.75rem] font-bold leading-none text-[var(--text-strong)]">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

export function DashboardPage() {
  const stats = useQuery<PlatformStats>('/v1/admin/stats');
  const series = useQuery<SeriesResponse>('/v1/admin/stats/series?days=30');
  const moderation = useQuery<ModerationCounts>('/v1/admin/moderation/counts');

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Platform health over the last 30 days."
        actions={
          moderation.data ? (
            <div className="flex flex-wrap gap-2">
              <Badge tone={moderation.data.openReports > 0 ? 'danger' : 'neutral'}>
                {moderation.data.openReports} open reports
              </Badge>
              <Badge tone={moderation.data.pendingComments > 0 ? 'warning' : 'neutral'}>
                {moderation.data.pendingComments} pending comments
              </Badge>
              <Badge tone={moderation.data.newMessages > 0 ? 'brand' : 'neutral'}>
                {moderation.data.newMessages} new messages
              </Badge>
            </div>
          ) : null
        }
      />

      {stats.error && <Alert>{stats.error}</Alert>}
      {stats.loading && !stats.data && <Spinner label="Loading statistics" />}

      {stats.data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Members"
            icon={UsersIcon}
            value={formatNumber(stats.data.totalUsers)}
            hint={`${formatNumber(stats.data.newUsers7d)} joined this week`}
          />
          <Stat
            label="Premium"
            icon={CrownIcon}
            tone="amber"
            value={formatNumber(stats.data.premiumUsers)}
            hint={`${formatNumber(stats.data.activeUsers30d)} active in 30 days`}
          />
          <Stat
            label="Revenue (30d)"
            icon={RupeeIcon}
            tone="emerald"
            value={formatMoney(stats.data.mrrMinor)}
            hint={`${formatMoney(stats.data.totalRevenueMinor)} lifetime`}
          />
          <Stat
            label="Payments"
            icon={TrendUpIcon}
            tone="emerald"
            value={formatNumber(stats.data.successfulPayments)}
            hint={`${formatNumber(stats.data.failedPayments)} failed`}
          />
          <Stat
            label="Prompts"
            icon={PromptsIcon}
            value={formatNumber(stats.data.publishedPrompts)}
            hint={`${formatNumber(stats.data.totalPrompts)} total · ${formatNumber(
              stats.data.premiumPrompts,
            )} premium`}
          />
          <Stat label="Views" value={formatNumber(stats.data.promptViews)} icon={EyeIcon} />
          <Stat
            label="Copies"
            icon={CopyIcon}
            value={formatNumber(stats.data.promptCopies)}
            hint={`${formatNumber(stats.data.totalFavorites)} saves · ${formatNumber(
              stats.data.totalLikes,
            )} likes`}
          />
          <Stat
            label="Generator runs"
            value={formatNumber(stats.data.generatorRuns)}
            icon={SettingsIcon}
          />
        </div>
      )}

      {series.data && (
        <>
          {/* Six sparklines, not four. `promptViews`, `revenue` and `conversions`
              were already in this response and were being discarded. */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Sparkline series={series.data.visitors} label="Visitors" />
            <Sparkline series={series.data.promptViews} label="Prompt views" />
            <Sparkline series={series.data.promptCopies} label="Copies" />
            <Sparkline series={series.data.signups} label="Signups" />
            <Sparkline series={series.data.conversions} label="Subscriptions" />
            <Sparkline series={series.data.revenue} label="Revenue" format={formatMoney} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Card
              title="Most viewed prompts"
              actions={
                <Link
                  to="/analytics"
                  className="text-xs font-semibold text-brand-600 hover:underline"
                >
                  Full analytics
                </Link>
              }
            >
              <BarList
                items={series.data.topPrompts.map((prompt) => ({
                  label: prompt.title,
                  value: prompt.views,
                  hint: `${formatNumber(prompt.copies)} copies`,
                }))}
                emptyLabel="No prompt activity yet."
              />
            </Card>

            <Card title="Top searches">
              <BarList
                items={series.data.topSearches.map((search) => ({
                  label: search.term,
                  value: search.hits,
                }))}
                emptyLabel="No searches recorded yet."
              />
            </Card>

            {/* Also previously fetched and dropped on the floor. */}
            <Card title="Biggest categories">
              <BarList
                items={series.data.topCategories.map((category) => ({
                  label: category.name,
                  value: category.promptCount,
                }))}
                emptyLabel="No categories yet."
                color="#0ea5e9"
              />
            </Card>
          </div>
        </>
      )}
    </>
  );
}
