import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminShell } from '@/components/admin/admin-shell';
import { AdminEmpty, AdminTable, type Column } from '@/components/admin/admin-table';
import { requireAdminPage } from '@/lib/auth/guards';
import { formatDate } from '@/lib/dates';
import { listTags } from '@/services/categories';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Tags' };

interface TagRow {
  id: string;
  name: string;
  slug: string;
  usageCount: number;
}

export default async function AdminTagsPage() {
  await requireAdminPage();
  const tags = await listTags(200);

  const columns: Column<TagRow>[] = [
    {
      key: 'name',
      header: 'Tag',
      render: (row) => (
        <Link href={`/explore?tag=${row.slug}`} className="font-semibold hover:text-brand-600">
          #{row.name}
        </Link>
      ),
    },
    {
      key: 'slug',
      header: 'Slug',
      hideOnMobile: true,
      render: (row) => <code className="text-xs text-body">{row.slug}</code>,
    },
    {
      key: 'usage',
      header: 'Used on',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums font-semibold">
          {row.usageCount} prompt{row.usageCount === 1 ? '' : 's'}
        </span>
      ),
    },
    {
      key: 'view',
      header: '',
      align: 'right',
      render: (row) => (
        <Link
          href={`/explore?tag=${row.slug}`}
          className="text-xs font-bold text-brand-600 hover:underline dark:text-brand-300"
        >
          View prompts
        </Link>
      ),
    },
  ];

  return (
    <AdminShell
      title="Tags"
      description="Tags are created automatically when you add them to a prompt. Edit a prompt to change its tags."
    >
      <AdminTable
        caption="Prompt tags"
        columns={columns}
        rows={tags as TagRow[]}
        rowKey={(row) => row.id}
        empty={
          <AdminEmpty
            title="No tags yet"
            description="Add comma-separated tags while editing a prompt and they will appear here."
          />
        }
        footer={
          <p className="text-xs text-faint">
            Showing {tags.length} tags, most used first. Last refreshed {formatDate(Math.floor(Date.now() / 1000))}.
          </p>
        }
      />
    </AdminShell>
  );
}
