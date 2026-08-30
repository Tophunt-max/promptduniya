import {
  Alert,
  Badge,
  Card,
  Cell,
  EmptyState,
  PageHeader,
  Row,
  Spinner,
  Table,
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

/**
 * Inline sparkline. An SVG polyline avoids pulling a charting library into the
 * bundle for what is a trend indicator.
 */
function Sparkline({ series, label }: { series: DailySeries; label: string }) {
  const values = series.values ?? [];
  const max = Math.max(1, ...values);
  const points = values
    .map((value, index) => {
      const x = values.length > 1 ? (index / (values.length - 1)) * 100 : 0;
      const y = 32 - (value / max) * 28;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const total = values.reduce((sum, value) => sum + value, 0);

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {label}
        </p>
        <p className="tabular text-base font-bold text-[var(--text-strong)]">
          {formatNumber(total)}
        </p>
      </div>
      {values.length > 1 ? (
        <svg
          viewBox="0 0 100 32"
          preserveAspectRatio="none"
          className="mt-3 h-11 w-full overflow-visible"
          aria-hidden
        >
          {/* Filled area under the line. A bare 1px polyline read as a stray
              diagonal scratch at this size rather than as a chart. */}
          <polygon points={`0,32 ${points} 100,32`} fill="var(--color-brand-500)" opacity="0.12" />
          <polyline
            points={points}
            fill="none"
            stroke="var(--color-brand-500)"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <p className="mt-3 h-11 text-xs text-[var(--text-muted)]">Not enough data yet.</p>
      )}
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
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Sparkline series={series.data.visitors} label="Visitors" />
            <Sparkline series={series.data.signups} label="Signups" />
            <Sparkline series={series.data.promptCopies} label="Copies" />
            <Sparkline series={series.data.generatorUsage} label="Generator" />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card title="Most viewed prompts">
              {series.data.topPrompts.length === 0 ? (
                <EmptyState>No prompt activity yet.</EmptyState>
              ) : (
                <Table head={['Prompt', 'Views', 'Copies', 'Likes']}>
                  {series.data.topPrompts.map((prompt) => (
                    <Row key={prompt.id}>
                      <Cell className="font-medium text-ink">{prompt.title}</Cell>
                      <Cell>{formatNumber(prompt.views)}</Cell>
                      <Cell>{formatNumber(prompt.copies)}</Cell>
                      <Cell>{formatNumber(prompt.likes)}</Cell>
                    </Row>
                  ))}
                </Table>
              )}
            </Card>

            <Card title="Top searches">
              {series.data.topSearches.length === 0 ? (
                <EmptyState>No searches recorded yet.</EmptyState>
              ) : (
                <Table head={['Term', 'Searches']}>
                  {series.data.topSearches.map((search) => (
                    <Row key={search.term}>
                      <Cell className="font-medium text-ink">{search.term}</Cell>
                      <Cell>{formatNumber(search.hits)}</Cell>
                    </Row>
                  ))}
                </Table>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
