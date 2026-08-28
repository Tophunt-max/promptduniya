import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminShell } from '@/components/admin/admin-shell';
import { AdminEmpty, AdminTable, CellStack, type Column } from '@/components/admin/admin-table';
import { CommentStatusControl, ReportStatusControl } from '@/components/admin/moderation-controls';
import { Badge } from '@/components/ui/badge';
import { requireAdminPage } from '@/lib/auth/guards';
import { formatDateTime, relativeTime } from '@/lib/dates';
import { listComments, listReports, pendingModerationCounts } from '@/services/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Moderation' };

type SearchParams = Promise<{ tab?: string; status?: string }>;

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

const REPORT_TONES: Record<string, 'brand' | 'marigold' | 'success' | 'neutral'> = {
  open: 'brand',
  reviewing: 'marigold',
  resolved: 'success',
  dismissed: 'neutral',
};

export default async function AdminModerationPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminPage();
  const { tab = 'reports' } = await searchParams;

  const [reports, comments, counts] = await Promise.all([
    listReports(),
    listComments(),
    pendingModerationCounts(),
  ]);

  const reportColumns: Column<ReportRow>[] = [
    {
      key: 'target',
      header: 'Reported item',
      render: (row) => (
        <CellStack
          primary={<span className="capitalize">{row.targetType}</span>}
          secondary={<span className="font-mono">{row.targetId}</span>}
        />
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => (
        <div className="max-w-sm">
          <Badge tone="rose" className="capitalize">
            {row.reason}
          </Badge>
          {row.details && <p className="mt-1.5 text-xs leading-relaxed text-body">{row.details}</p>}
        </div>
      ),
    },
    {
      key: 'reporter',
      header: 'Reported by',
      hideOnMobile: true,
      render: (row) => (
        <CellStack primary={row.reporterName ?? 'Anonymous'} secondary={row.reporterEmail ?? ''} />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={REPORT_TONES[row.status] ?? 'neutral'}>{row.status}</Badge>,
    },
    {
      key: 'when',
      header: 'When',
      hideOnMobile: true,
      render: (row) => <span className="text-xs text-faint">{relativeTime(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => <ReportStatusControl reportId={row.id} status={row.status} />,
    },
  ];

  const commentColumns: Column<CommentRow>[] = [
    {
      key: 'author',
      header: 'Author',
      render: (row) => (
        <CellStack primary={row.authorName ?? '—'} secondary={row.authorEmail ?? ''} />
      ),
    },
    {
      key: 'body',
      header: 'Comment',
      render: (row) => (
        <p className="max-w-md text-sm leading-relaxed text-body">{row.body}</p>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge
          tone={
            row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'rose' : 'marigold'
          }
        >
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'when',
      header: 'Posted',
      hideOnMobile: true,
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-faint">{formatDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => <CommentStatusControl commentId={row.id} status={row.status} />,
    },
  ];

  return (
    <AdminShell
      title="Moderation"
      description="Content reports and comments awaiting review."
      pendingCount={counts.openReports + counts.pendingComments}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href="/admin/moderation"
          className={
            tab === 'reports'
              ? 'rounded-full bg-ink-900 px-3.5 py-1.5 text-xs font-bold text-white dark:bg-white dark:text-ink-950'
              : 'rounded-full bg-[var(--surface-sunken)] px-3.5 py-1.5 text-xs font-semibold text-body'
          }
        >
          Reports {counts.openReports > 0 && `(${counts.openReports})`}
        </Link>
        <Link
          href="/admin/moderation?tab=comments"
          className={
            tab === 'comments'
              ? 'rounded-full bg-ink-900 px-3.5 py-1.5 text-xs font-bold text-white dark:bg-white dark:text-ink-950'
              : 'rounded-full bg-[var(--surface-sunken)] px-3.5 py-1.5 text-xs font-semibold text-body'
          }
        >
          Comments {counts.pendingComments > 0 && `(${counts.pendingComments})`}
        </Link>
      </div>

      {tab === 'comments' ? (
        <AdminTable
          caption="Comments awaiting moderation"
          columns={commentColumns}
          rows={comments as CommentRow[]}
          rowKey={(row) => row.id}
          empty={
            <AdminEmpty
              title="No comments to review"
              description="Comments are held for approval before they appear publicly."
            />
          }
        />
      ) : (
        <AdminTable
          caption="Content reports"
          columns={reportColumns}
          rows={reports as ReportRow[]}
          rowKey={(row) => row.id}
          empty={
            <AdminEmpty
              title="Nothing reported"
              description="Reports raised by users will appear here for review."
            />
          }
        />
      )}
    </AdminShell>
  );
}
