import { useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Card,
  Cell,
  EmptyState,
  PageHeader,
  Row,
  Select,
  Spinner,
  Table,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from '@/components/ui';
import { api, qs } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/use-api';

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

interface EventRow {
  id: string;
  eventType: string;
  eventKey: string;
  signatureValid: boolean;
  processedAt: number | null;
  processingError: string | null;
  createdAt: number;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

type Tab = 'payments' | 'subscriptions' | 'events';

function statusTone(status: string) {
  if (status === 'captured' || status === 'active') return 'success' as const;
  if (status === 'failed' || status === 'cancelled') return 'danger' as const;
  if (status === 'created' || status === 'past_due') return 'warning' as const;
  return 'neutral' as const;
}

export function BillingPage() {
  const [tab, setTab] = useState<Tab>('payments');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const action = useMutation();

  const payments = useQuery<Paged<PaymentRow>>(
    tab === 'payments' ? `/v1/admin/payments${qs({ status, page, pageSize: 25 })}` : null,
  );
  const subscriptions = useQuery<Paged<SubscriptionRow>>(
    tab === 'subscriptions' ? `/v1/admin/subscriptions${qs({ status, page, pageSize: 25 })}` : null,
  );
  const events = useQuery<{ items: EventRow[] }>(
    tab === 'events' ? '/v1/admin/payments/events?limit=100' : null,
  );

  const active = tab === 'payments' ? payments : tab === 'subscriptions' ? subscriptions : events;
  const paged = tab === 'payments' ? payments.data : tab === 'subscriptions' ? subscriptions.data : null;
  const totalPages = paged ? Math.max(1, Math.ceil(paged.total / paged.pageSize)) : 1;

  const STATUS_OPTIONS: Record<Tab, string[]> = {
    payments: ['created', 'authorized', 'captured', 'failed', 'refunded'],
    subscriptions: ['active', 'past_due', 'cancelled', 'expired'],
    events: [],
  };

  /**
   * Cancels a membership on the member's behalf.
   *
   * Ends auto-renewal and lets the paid period run out rather than revoking access
   * immediately — cancelling a plan someone has already paid for should not take
   * away what they bought.
   */
  async function cancel(row: SubscriptionRow) {
    if (
      !window.confirm(
        `Cancel ${row.userEmail}'s ${row.planName} membership? Access continues until ${formatDate(row.endDate)}.`,
      )
    ) {
      return;
    }

    const result = await action.run(() =>
      api.post(`/v1/admin/subscriptions/${encodeURIComponent(row.id)}/cancel`, {}),
    );
    if (result !== null) {
      setNotice(`Cancelled ${row.userEmail}'s membership.`);
      subscriptions.reload();
    }
  }

  return (
    <>
      <PageHeader
        title="Billing"
        description="Payments, memberships and the raw gateway webhook log."
      />

      {action.error && <Alert>{action.error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['payments', 'subscriptions', 'events'] as Tab[]).map((item) => (
          <Button
            key={item}
            size="sm"
            variant={tab === item ? 'primary' : 'outline'}
            onClick={() => {
              setTab(item);
              setStatus('');
              setPage(1);
            }}
          >
            {item === 'events' ? 'Webhook log' : item}
          </Button>
        ))}

        {STATUS_OPTIONS[tab].length > 0 && (
          <Select
            className="ml-auto w-auto"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Any status</option>
            {STATUS_OPTIONS[tab].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        )}
      </div>

      <Card>
        {active.error && <Alert>{active.error}</Alert>}
        {active.loading && !active.data && <Spinner label="Loading" />}

        {tab === 'payments' && payments.data && (
          payments.data.items.length === 0 ? (
            <EmptyState>No payments recorded.</EmptyState>
          ) : (
            <Table head={['Member', 'Amount', 'Status', 'Reference', 'When']}>
              {payments.data.items.map((row) => (
                <Row key={row.id}>
                  <Cell>
                    <span className="font-semibold text-ink">{row.userName ?? '—'}</span>
                    <p className="text-xs text-muted">{row.userEmail}</p>
                  </Cell>
                  <Cell className="whitespace-nowrap font-semibold text-ink">
                    {formatMoney(row.amountMinor, row.currency)}
                  </Cell>
                  <Cell>
                    <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    {row.method && <p className="mt-0.5 text-xs text-muted">{row.method}</p>}
                  </Cell>
                  <Cell className="font-mono text-xs">
                    {row.receiptId ?? row.providerOrderId ?? '—'}
                  </Cell>
                  <Cell className="whitespace-nowrap text-xs">{formatDateTime(row.createdAt)}</Cell>
                </Row>
              ))}
            </Table>
          )
        )}

        {tab === 'subscriptions' && subscriptions.data && (
          subscriptions.data.items.length === 0 ? (
            <EmptyState>No memberships yet.</EmptyState>
          ) : (
            <Table head={['Member', 'Plan', 'Status', 'Period', 'Renewal', '']}>
              {subscriptions.data.items.map((row) => (
                <Row key={row.id}>
                  <Cell>
                    <span className="font-semibold text-ink">{row.userName ?? '—'}</span>
                    <p className="text-xs text-muted">{row.userEmail}</p>
                  </Cell>
                  <Cell>
                    <span className="font-medium text-ink">{row.planName}</span>
                    <p className="font-mono text-xs text-muted">{row.planCode}</p>
                  </Cell>
                  <Cell>
                    <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                  </Cell>
                  <Cell className="whitespace-nowrap text-xs">
                    {formatDate(row.startDate)} → {formatDate(row.endDate)}
                  </Cell>
                  <Cell className="text-xs">{row.autoRenew ? 'Auto-renews' : 'Ends'}</Cell>
                  <Cell>
                    {/* This screen was entirely read-only. `cancelSubscription`
                        existed but was scoped to the member's own dashboard, so
                        support work had no way to act on a membership at all. */}
                    {row.status === 'active' && (
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={action.pending}
                          onClick={() => void cancel(row)}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </Cell>
                </Row>
              ))}
            </Table>
          )
        )}

        {tab === 'events' && events.data && (
          events.data.items.length === 0 ? (
            <EmptyState>No webhooks received.</EmptyState>
          ) : (
            <Table head={['Event', 'Signature', 'Processed', 'Received']}>
              {events.data.items.map((row) => (
                <Row key={row.id}>
                  <Cell>
                    <span className="font-medium text-ink">{row.eventType}</span>
                    <p className="font-mono text-xs text-muted">{row.eventKey}</p>
                  </Cell>
                  <Cell>
                    <Badge tone={row.signatureValid ? 'success' : 'danger'}>
                      {row.signatureValid ? 'Valid' : 'Invalid'}
                    </Badge>
                  </Cell>
                  <Cell className="text-xs">
                    {row.processedAt ? formatDateTime(row.processedAt) : '—'}
                    {row.processingError && (
                      <p className="text-rose-600">{row.processingError}</p>
                    )}
                  </Cell>
                  <Cell className="whitespace-nowrap text-xs">{formatDateTime(row.createdAt)}</Cell>
                </Row>
              ))}
            </Table>
          )
        )}

        {paged && totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <p className="text-xs text-muted">
              Page {page} of {totalPages} · {formatNumber(paged.total)} records
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
