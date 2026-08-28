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
  formatMoney,
  formatNumber,
} from '@/components/ui';
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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
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
      const y = 30 - (value / max) * 28;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const total = values.reduce((sum, value) => sum + value, 0);

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className="text-sm font-bold text-ink">{formatNumber(total)}</p>
      </div>
      {values.length > 1 ? (
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-2 h-10 w-full" aria-hidden>
          <polyline
            points={points}
            fill="none"
            stroke="var(--color-brand-600)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <p className="mt-2 text-xs text-muted">Not enough data yet.</p>
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
            value={formatNumber(stats.data.totalUsers)}
            hint={`${formatNumber(stats.data.newUsers7d)} joined this week`}
          />
          <Stat
            label="Premium"
            value={formatNumber(stats.data.premiumUsers)}
            hint={`${formatNumber(stats.data.activeUsers30d)} active in 30 days`}
          />
          <Stat
            label="Revenue (30d)"
            value={formatMoney(stats.data.mrrMinor)}
            hint={`${formatMoney(stats.data.totalRevenueMinor)} lifetime`}
          />
          <Stat
            label="Payments"
            value={formatNumber(stats.data.successfulPayments)}
            hint={`${formatNumber(stats.data.failedPayments)} failed`}
          />
          <Stat
            label="Prompts"
            value={formatNumber(stats.data.publishedPrompts)}
            hint={`${formatNumber(stats.data.totalPrompts)} total · ${formatNumber(
              stats.data.premiumPrompts,
            )} premium`}
          />
          <Stat label="Views" value={formatNumber(stats.data.promptViews)} />
          <Stat
            label="Copies"
            value={formatNumber(stats.data.promptCopies)}
            hint={`${formatNumber(stats.data.totalFavorites)} saves · ${formatNumber(
              stats.data.totalLikes,
            )} likes`}
          />
          <Stat label="Generator runs" value={formatNumber(stats.data.generatorRuns)} />
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
