import type { Metadata } from 'next';

import { AdminShell } from '@/components/admin/admin-shell';
import { AdminEmpty, AdminTable, CellStack, type Column } from '@/components/admin/admin-table';
import { MessageStatusControl } from '@/components/admin/moderation-controls';
import { Badge } from '@/components/ui/badge';
import { requireAdminPage } from '@/lib/auth/guards';
import { formatDateTime } from '@/lib/dates';
import { listContactMessages } from '@/services/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Messages' };

interface MessageRow {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  createdAt: number;
}

const TONES: Record<string, 'brand' | 'neutral' | 'success' | 'rose'> = {
  new: 'brand',
  read: 'neutral',
  replied: 'success',
  spam: 'rose',
};

export default async function AdminMessagesPage() {
  await requireAdminPage();
  const messages = await listContactMessages();

  const columns: Column<MessageRow>[] = [
    {
      key: 'from',
      header: 'From',
      render: (row) => <CellStack primary={row.name} secondary={row.email} />,
    },
    {
      key: 'subject',
      header: 'Message',
      render: (row) => (
        <details className="group max-w-md">
          <summary className="cursor-pointer list-none marker:hidden">
            <span className="font-semibold group-open:text-brand-600">{row.subject}</span>
          </summary>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-body">
            {row.message}
          </p>
          <a
            href={`mailto:${row.email}?subject=${encodeURIComponent(`Re: ${row.subject}`)}`}
            className="mt-2 inline-block text-xs font-bold text-brand-600 hover:underline dark:text-brand-300"
          >
            Reply by email
          </a>
        </details>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={TONES[row.status] ?? 'neutral'}>{row.status}</Badge>,
    },
    {
      key: 'received',
      header: 'Received',
      hideOnMobile: true,
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-faint">{formatDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => <MessageStatusControl messageId={row.id} status={row.status} />,
    },
  ];

  return (
    <AdminShell
      title="Contact messages"
      description="Enquiries from the public contact form. Personal email addresses are never exposed on the site."
    >
      <AdminTable
        caption="Contact form messages"
        columns={columns}
        rows={messages as MessageRow[]}
        rowKey={(row) => row.id}
        empty={<AdminEmpty title="No messages yet" description="Contact form submissions land here." />}
      />
    </AdminShell>
  );
}
