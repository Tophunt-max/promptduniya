import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminShell } from '@/components/admin/admin-shell';
import { AdminStat } from '@/components/admin/admin-chart';
import { AdminEmpty, AdminTable, CellStack, type Column } from '@/components/admin/admin-table';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { requireStrictAdminPage } from '@/lib/auth/guards';
import { formatDateTime, relativeTime } from '@/lib/dates';
import { formatMoney } from '@/lib/utils';
import { platformStats } from '@/services/analytics';
import { adminListPaymentEvents, adminListPayments } from '@/services/payments';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Payments' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface PaymentRow {
  id: string;
  userEmail: string | null;
  userName: string | null;
  amountMinor: number;
  currency: string;
  status: string;
  method: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  receiptId: string | null;
  createdAt: number;
}

const STATUS_FILTERS = [
  { id: '', label: 'All' },
  { id: 'captured', label: 'Captured' },
  { id: 'created', label: 'Pending' },
  { id: 'failed', label: 'Failed' },
  { id: 'refunded', label: 'Refunded' },
] as const;

const TONES: Record<string, 'success' | 'rose' | 'marigold' | 'neutral'> = {
  captured: 'success',
  failed: 'rose',
  created: 'marigold',
  refunded: 'neutral',
  partially_refunded: 'neutral',
};

export default async function AdminPaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireStrictAdminPage();
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const status = first(raw.status) ?? '';
  const page = Number.parseInt(first(raw.page) ?? '1', 10) || 1;

  const [result, stats, events] = await Promise.all([
    adminListPayments({ page, pageSize: 30, status: status || undefined }),
    platformStats(),
    adminListPaymentEvents(15),
  ]);

  const columns: Column<PaymentRow>[] = [
    {
      key: 'user',
      header: 'Customer',
      render: (row) => <CellStack primary={row.userName ?? '—'} secondary={row.userEmail ?? ''} />,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => (
        <span className="font-bold tabular-nums">{formatMoney(row.amountMinor, row.currency)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={TONES[row.status] ?? 'neutral'}>{row.status}</Badge>,
    },
    {
      key: 'method',
      header: 'Method',
      hideOnMobile: true,
      render: (row) => <span className="capitalize text-body">{row.method ?? '—'}</span>,
    },
    {
      key: 'refs',
      header: 'Provider references',
      hideOnMobile: true,
      render: (row) => (
        <CellStack
          primary={<span className="font-mono text-xs font-normal">{row.providerOrderId ?? '—'}</span>}
          secondary={row.providerPaymentId ?? row.receiptId ?? ''}
        />
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-faint">{formatDateTime(row.createdAt)}</span>
      ),
    },
  ];

  const buildHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (nextPage > 1) params.set('page', String(nextPage));
    const search = params.toString();
    return search ? `/admin/payments?${search}` : '/admin/payments';
  };

  return (
    <AdminShell
      title="Payments"
      description="Every payment attempt, plus the raw provider webhook log."
    >
      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStat
          label="Revenue (all time)"
          value={formatMoney(stats.totalRevenueMinor)}
          tone="positive"
        />
        <AdminStat label="Revenue (30 days)" value={formatMoney(stats.mrrMinor)} tone="positive" />
        <AdminStat label="Successful" value={String(stats.successfulPayments)} />
        <AdminStat
          label="Failed"
          value={String(stats.failedPayments)}
          tone={stats.failedPayments > 0 ? 'negative' : 'default'}
        />
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Link
            key={filter.id || 'all'}
            href={filter.id ? `/admin/payments?status=${filter.id}` : '/admin/payments'}
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
        caption="Payment records"
        columns={columns}
        rows={result.items as PaymentRow[]}
        rowKey={(row) => row.id}
        empty={
          <AdminEmpty
            title="No payments yet"
            description="Payments will appear here once a member completes checkout."
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

      <section className="mt-10" aria-labelledby="webhooks">
        <h2 id="webhooks" className="mb-2 text-base font-bold">
          Webhook deliveries
        </h2>
        <p className="mb-4 max-w-2xl text-sm text-body">
          Each delivery is stored with a unique event key, which is what makes webhook processing
          idempotent — a redelivered event is acknowledged without creating a second transaction.
          Deliveries that fail signature verification are logged and rejected.
        </p>

        {events.length === 0 ? (
          <p className="card p-5 text-sm text-faint">No webhook deliveries recorded yet.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">Provider webhook delivery log</caption>
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-left">
                  <th scope="col" className="px-4 py-3 font-bold">Event</th>
                  <th scope="col" className="px-4 py-3 font-bold">Signature</th>
                  <th scope="col" className="px-4 py-3 font-bold">Processed</th>
                  <th scope="col" className="px-4 py-3 font-bold">Received</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b border-[var(--border-subtle)] last:border-0">
                    <td className="px-4 py-3">
                      <CellStack
                        primary={event.eventType}
                        secondary={<span className="font-mono">{event.eventKey.slice(0, 32)}</span>}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={event.signatureValid ? 'success' : 'rose'}>
                        {event.signatureValid ? 'Valid' : 'Rejected'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {event.processingError ? (
                        <span className="text-xs text-rose-600 dark:text-rose-400">
                          {event.processingError}
                        </span>
                      ) : event.processedAt ? (
                        <Badge tone="success">Handled</Badge>
                      ) : (
                        <Badge tone="marigold">Queued</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-faint">
                      {relativeTime(event.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
