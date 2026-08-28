import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminShell } from '@/components/admin/admin-shell';
import { AdminEmpty, AdminTable, CellStack, type Column } from '@/components/admin/admin-table';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { requireStrictAdminPage } from '@/lib/auth/guards';
import { daysUntil, formatDate } from '@/lib/dates';
import { adminListSubscriptions } from '@/services/subscriptions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Subscriptions' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface SubscriptionRow {
  id: string;
  userEmail: string | null;
  userName: string | null;
  planName: string;
  planCode: string;
  status: string;
  startDate: number | null;
  endDate: number | null;
  autoRenew: boolean;
  createdAt: number;
}

const STATUS_FILTERS = [
  { id: '', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'expired', label: 'Expired' },
  { id: 'cancelled', label: 'Cancelled' },
] as const;

const TONES: Record<string, 'success' | 'rose' | 'marigold' | 'neutral'> = {
  active: 'success',
  cancelled: 'rose',
  expired: 'neutral',
  past_due: 'marigold',
  created: 'marigold',
};

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireStrictAdminPage();
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const status = first(raw.status) ?? '';
  const page = Number.parseInt(first(raw.page) ?? '1', 10) || 1;

  const result = await adminListSubscriptions({
    page,
    pageSize: 30,
    status: status || undefined,
  });

  const columns: Column<SubscriptionRow>[] = [
    {
      key: 'user',
      header: 'Member',
      render: (row) => <CellStack primary={row.userName ?? '—'} secondary={row.userEmail ?? ''} />,
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (row) => <Badge tone="brand">{row.planName}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-col gap-1">
          <Badge tone={TONES[row.status] ?? 'neutral'}>{row.status}</Badge>
          <span className="text-[0.6875rem] text-faint">
            {row.autoRenew ? 'Auto-renew on' : 'Auto-renew off'}
          </span>
        </div>
      ),
    },
    {
      key: 'period',
      header: 'Period',
      hideOnMobile: true,
      render: (row) => (
        <CellStack
          primary={
            <span className="text-xs font-normal">
              {formatDate(row.startDate)} → {row.endDate ? formatDate(row.endDate) : 'Lifetime'}
            </span>
          }
          secondary={
            row.endDate && row.status === 'active'
              ? `${daysUntil(row.endDate) ?? 0} days remaining`
              : ''
          }
        />
      ),
    },
    {
      key: 'created',
      header: 'Started',
      hideOnMobile: true,
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-faint">{formatDate(row.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Link
          href={`/admin/users?q=${encodeURIComponent(row.userEmail ?? '')}`}
          className="text-xs font-bold text-brand-600 hover:underline dark:text-brand-300"
        >
          Manage member
        </Link>
      ),
    },
  ];

  const buildHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (nextPage > 1) params.set('page', String(nextPage));
    const search = params.toString();
    return search ? `/admin/subscriptions?${search}` : '/admin/subscriptions';
  };

  return (
    <AdminShell
      title="Subscriptions"
      description={`${result.total} subscription record${result.total === 1 ? '' : 's'}. Access is always recomputed from these rows.`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Link
            key={filter.id || 'all'}
            href={filter.id ? `/admin/subscriptions?status=${filter.id}` : '/admin/subscriptions'}
            className={
              status === filter.id
                ? 'rounded-full bg-ink-900 px-3.5 py-1.5 text-xs font-bold text-white dark:bg-white dark:text-ink-950'
                : 'rounded-full bg-[var(--surface-sunken)] px-3.5 py-1.5 text-xs font-semibold text-body hover:text-[var(--text-primary)]'
            }
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <AdminTable
        caption="Subscription records"
        columns={columns}
        rows={result.items as SubscriptionRow[]}
        rowKey={(row) => row.id}
        empty={
          <AdminEmpty
            title="No subscriptions yet"
            description="Subscriptions appear here after a successful payment or a manual grant."
          />
        }
      />

      {result.total > result.pageSize && (
        <Pagination
          page={result.page}
          totalPages={Math.ceil(result.total / result.pageSize)}
          buildHref={buildHref}
          className="mt-6"
        />
      )}
    </AdminShell>
  );
}
