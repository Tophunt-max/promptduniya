import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminShell } from '@/components/admin/admin-shell';
import { AdminEmpty, AdminTable, CellStack, type Column } from '@/components/admin/admin-table';
import { PromptRowActions } from '@/components/admin/prompt-row-actions';
import { Badge, ModelBadge, PremiumBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { PlusIcon } from '@/components/ui/icon';
import { Pagination } from '@/components/ui/pagination';
import { requireAdminPage } from '@/lib/auth/guards';
import { relativeTime } from '@/lib/dates';
import { formatCompact } from '@/lib/utils';
import { adminListPrompts, type AdminPromptRow } from '@/services/prompts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Prompts' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Drafts' },
] as const;

export default async function AdminPromptsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminPage();
  const raw = await searchParams;

  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const status = (first(raw.status) ?? 'all') as 'all' | 'published' | 'draft';
  const query = first(raw.q);
  const page = Number.parseInt(first(raw.page) ?? '1', 10) || 1;

  const result = await adminListPrompts({ page, pageSize: 25, q: query, status });

  const columns: Column<AdminPromptRow>[] = [
    {
      key: 'title',
      header: 'Prompt',
      render: (row) => (
        <CellStack
          primary={
            <Link href={`/admin/prompts/${row.id}`} className="hover:text-brand-600">
              {row.title}
            </Link>
          }
          secondary={`/${row.slug}`}
        />
      ),
    },
    {
      key: 'model',
      header: 'Model',
      render: (row) => <ModelBadge model={row.aiModel} />,
    },
    {
      key: 'category',
      header: 'Category',
      hideOnMobile: true,
      render: (row) => <span className="text-body">{row.categoryName}</span>,
    },
    {
      key: 'flags',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={row.isPublished ? 'success' : 'neutral'}>
            {row.isPublished ? 'Published' : 'Draft'}
          </Badge>
          {row.isPremium && <PremiumBadge compact />}
          {row.isTrending && <Badge tone="rose">Trending</Badge>}
          {row.isFeatured && <Badge tone="brand">Featured</Badge>}
        </div>
      ),
    },
    {
      key: 'stats',
      header: 'Views / Copies',
      align: 'right',
      hideOnMobile: true,
      render: (row) => (
        <span className="tabular-nums text-body">
          {formatCompact(row.viewCount)} / {formatCompact(row.copyCount)}
        </span>
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      hideOnMobile: true,
      render: (row) => <span className="text-xs text-faint">{relativeTime(row.updatedAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <PromptRowActions
          promptId={row.id}
          slug={row.slug}
          title={row.title}
          isPublished={row.isPublished}
        />
      ),
    },
  ];

  const buildHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (query) params.set('q', query);
    if (nextPage > 1) params.set('page', String(nextPage));
    const search = params.toString();
    return search ? `/admin/prompts?${search}` : '/admin/prompts';
  };

  return (
    <AdminShell
      title="Prompts"
      description={`${result.total} prompt${result.total === 1 ? '' : 's'} in the library.`}
      actions={
        <ButtonLink href="/admin/prompts/new" size="sm" leadingIcon={<PlusIcon size={15} />}>
          New prompt
        </ButtonLink>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.id}
            href={tab.id === 'all' ? '/admin/prompts' : `/admin/prompts?status=${tab.id}`}
            className={
              status === tab.id
                ? 'rounded-full bg-ink-900 px-3.5 py-1.5 text-xs font-bold text-white dark:bg-white dark:text-ink-950'
                : 'rounded-full bg-[var(--surface-sunken)] px-3.5 py-1.5 text-xs font-semibold text-body hover:text-[var(--text-primary)]'
            }
          >
            {tab.label}
          </Link>
        ))}

        <form action="/admin/prompts" className="ml-auto flex items-center gap-2">
          {status !== 'all' && <input type="hidden" name="status" value={status} />}
          <label htmlFor="admin-prompt-search" className="sr-only">
            Search prompts
          </label>
          <input
            id="admin-prompt-search"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search prompts…"
            className="h-9 w-48 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 text-sm focus:border-brand-500 focus:outline-none"
          />
          <button
            type="submit"
            className="h-9 rounded-xl bg-[var(--surface-sunken)] px-3 text-xs font-bold hover:bg-brand-50 dark:hover:bg-brand-950/50"
          >
            Search
          </button>
        </form>
      </div>

      <AdminTable
        caption="Prompt library"
        columns={columns}
        rows={result.items}
        rowKey={(row) => row.id}
        empty={
          <AdminEmpty
            title="No prompts found"
            description={
              query
                ? `Nothing matched “${query}”. Try a different search.`
                : 'Create your first prompt to get the library started.'
            }
          >
            <ButtonLink href="/admin/prompts/new" leadingIcon={<PlusIcon size={15} />}>
              New prompt
            </ButtonLink>
          </AdminEmpty>
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
