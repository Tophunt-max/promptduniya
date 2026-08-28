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
  formatDateTime,
} from '@/components/ui';
import { api, qs } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/use-api';

interface ReportRow {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: number;
  reporterName: string | null;
  reporterEmail: string | null;
}

interface CommentRow {
  id: string;
  body: string;
  status: string;
  promptId: string | null;
  articleId: string | null;
  createdAt: number;
  authorName: string | null;
  authorEmail: string | null;
}

interface MessageRow {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  createdAt: number;
}

type Tab = 'reports' | 'comments' | 'messages';

const TABS: { id: Tab; label: string }[] = [
  { id: 'reports', label: 'Reports' },
  { id: 'comments', label: 'Comments' },
  { id: 'messages', label: 'Messages' },
];

export function ModerationPage() {
  const [tab, setTab] = useState<Tab>('reports');
  const [status, setStatus] = useState('');
  const { run, pending, error } = useMutation();

  const reports = useQuery<{ items: ReportRow[] }>(
    tab === 'reports' ? `/v1/admin/reports${qs({ status })}` : null,
  );
  const comments = useQuery<{ items: CommentRow[] }>(
    tab === 'comments' ? `/v1/admin/comments${qs({ status })}` : null,
  );
  const messages = useQuery<{ items: MessageRow[] }>(
    tab === 'messages' ? `/v1/admin/contact-messages${qs({ status })}` : null,
  );

  const active = tab === 'reports' ? reports : tab === 'comments' ? comments : messages;

  async function resolveReport(id: string, next: 'reviewing' | 'resolved' | 'dismissed') {
    const ok = await run(() => api.patch(`/v1/admin/reports/${id}`, { status: next }));
    if (ok !== null) reports.reload();
  }

  async function moderateComment(id: string, next: 'approved' | 'rejected') {
    const ok = await run(() => api.patch(`/v1/admin/comments/${id}`, { status: next }));
    if (ok !== null) comments.reload();
  }

  async function markMessage(id: string, next: 'read' | 'replied' | 'spam') {
    const ok = await run(() => api.patch(`/v1/admin/contact-messages/${id}`, { status: next }));
    if (ok !== null) messages.reload();
  }

  const STATUS_OPTIONS: Record<Tab, string[]> = {
    reports: ['open', 'reviewing', 'resolved', 'dismissed'],
    comments: ['pending', 'approved', 'rejected'],
    messages: ['new', 'read', 'replied', 'spam'],
  };

  return (
    <>
      <PageHeader title="Moderation" description="Reports, comments and inbound messages." />

      {error && <Alert>{error}</Alert>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant={tab === item.id ? 'primary' : 'outline'}
            onClick={() => {
              setTab(item.id);
              setStatus('');
            }}
          >
            {item.label}
          </Button>
        ))}

        <Select
          className="ml-auto w-auto"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">Any status</option>
          {STATUS_OPTIONS[tab].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        {active.error && <Alert>{active.error}</Alert>}
        {active.loading && !active.data && <Spinner label="Loading" />}

        {tab === 'reports' && reports.data && (
          reports.data.items.length === 0 ? (
            <EmptyState>Nothing to review.</EmptyState>
          ) : (
            <Table head={['Target', 'Reason', 'Reporter', 'Received', '']}>
              {reports.data.items.map((row) => (
                <Row key={row.id}>
                  <Cell>
                    <span className="font-semibold text-ink">{row.targetType}</span>
                    <p className="font-mono text-xs text-muted">{row.targetId}</p>
                    <Badge tone={row.status === 'open' ? 'danger' : 'neutral'}>{row.status}</Badge>
                  </Cell>
                  <Cell>
                    <span className="font-medium text-ink">{row.reason}</span>
                    {row.details && <p className="mt-0.5 text-xs text-muted">{row.details}</p>}
                  </Cell>
                  <Cell className="text-xs">{row.reporterEmail ?? 'Anonymous'}</Cell>
                  <Cell className="whitespace-nowrap text-xs">{formatDateTime(row.createdAt)}</Cell>
                  <Cell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => void resolveReport(row.id, 'resolved')}
                      >
                        Resolve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => void resolveReport(row.id, 'dismissed')}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </Cell>
                </Row>
              ))}
            </Table>
          )
        )}

        {tab === 'comments' && comments.data && (
          comments.data.items.length === 0 ? (
            <EmptyState>No comments in this state.</EmptyState>
          ) : (
            <Table head={['Comment', 'Author', 'Posted', '']}>
              {comments.data.items.map((row) => (
                <Row key={row.id}>
                  <Cell>
                    <p className="text-ink">{row.body}</p>
                    <Badge tone={row.status === 'pending' ? 'warning' : 'neutral'}>
                      {row.status}
                    </Badge>
                  </Cell>
                  <Cell className="text-xs">{row.authorEmail ?? '—'}</Cell>
                  <Cell className="whitespace-nowrap text-xs">{formatDateTime(row.createdAt)}</Cell>
                  <Cell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => void moderateComment(row.id, 'approved')}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => void moderateComment(row.id, 'rejected')}
                      >
                        Reject
                      </Button>
                    </div>
                  </Cell>
                </Row>
              ))}
            </Table>
          )
        )}

        {tab === 'messages' && messages.data && (
          messages.data.items.length === 0 ? (
            <EmptyState>No messages in this state.</EmptyState>
          ) : (
            <Table head={['From', 'Subject', 'Received', '']}>
              {messages.data.items.map((row) => (
                <Row key={row.id}>
                  <Cell>
                    <span className="font-semibold text-ink">{row.name}</span>
                    <p className="text-xs text-muted">{row.email}</p>
                    <Badge tone={row.status === 'new' ? 'brand' : 'neutral'}>{row.status}</Badge>
                  </Cell>
                  <Cell>
                    <span className="font-medium text-ink">{row.subject}</span>
                    <p className="mt-0.5 text-xs text-muted">{row.message}</p>
                  </Cell>
                  <Cell className="whitespace-nowrap text-xs">{formatDateTime(row.createdAt)}</Cell>
                  <Cell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => void markMessage(row.id, 'replied')}
                      >
                        Replied
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => void markMessage(row.id, 'spam')}
                      >
                        Spam
                      </Button>
                    </div>
                  </Cell>
                </Row>
              ))}
            </Table>
          )
        )}
      </Card>
    </>
  );
}
