import type { Metadata } from 'next';

import { AdminShell } from '@/components/admin/admin-shell';
import { AdminEmpty, AdminTable, CellStack, type Column } from '@/components/admin/admin-table';
import { Badge } from '@/components/ui/badge';
import { requireStrictAdminPage } from '@/lib/auth/guards';
import { formatDateTime } from '@/lib/dates';
import { listAdminLogs } from '@/services/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Audit log' };

interface LogRow {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metaJson: string | null;
  createdAt: number;
  actorName: string | null;
  actorEmail: string | null;
}

function toneFor(action: string): 'rose' | 'marigold' | 'brand' | 'neutral' {
  if (action.includes('delete')) return 'rose';
  if (action.includes('settings') || action.includes('plan') || action.includes('coupon')) {
    return 'marigold';
  }
  if (action.includes('user')) return 'brand';
  return 'neutral';
}

export default async function AdminLogsPage() {
  await requireStrictAdminPage();
  const logs = await listAdminLogs(150);

  const columns: Column<LogRow>[] = [
    {
      key: 'action',
      header: 'Action',
      render: (row) => <Badge tone={toneFor(row.action)}>{row.action}</Badge>,
    },
    {
      key: 'actor',
      header: 'Performed by',
      render: (row) => (
        <CellStack primary={row.actorName ?? 'System'} secondary={row.actorEmail ?? ''} />
      ),
    },
    {
      key: 'target',
      header: 'Target',
      hideOnMobile: true,
      render: (row) => (
        <CellStack
          primary={<span className="text-xs font-normal">{row.targetType ?? '—'}</span>}
          secondary={<span className="font-mono">{row.targetId ?? ''}</span>}
        />
      ),
    },
    {
      key: 'meta',
      header: 'Details',
      hideOnMobile: true,
      render: (row) =>
        row.metaJson ? (
          <code className="block max-w-xs truncate text-xs text-body" title={row.metaJson}>
            {row.metaJson}
          </code>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: 'when',
      header: 'When',
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-faint">{formatDateTime(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <AdminShell
      title="Audit log"
      description="Every privileged action is recorded here — content changes, role changes, price changes and settings updates."
    >
      <AdminTable
        caption="Administrator audit log"
        columns={columns}
        rows={logs as LogRow[]}
        rowKey={(row) => row.id}
        empty={
          <AdminEmpty
            title="No admin activity yet"
            description="Privileged actions will be recorded here as they happen."
          />
        }
      />
    </AdminShell>
  );
}
