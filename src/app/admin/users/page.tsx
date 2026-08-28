import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminShell } from '@/components/admin/admin-shell';
import { AdminEmpty, AdminTable, CellStack, type Column } from '@/components/admin/admin-table';
import { UserRowActions } from '@/components/admin/user-row-actions';
import { Badge, PremiumBadge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { requireStrictAdminPage } from '@/lib/auth/guards';
import { formatDate, relativeTime } from '@/lib/dates';
import { UserAvatar } from '@/components/layout/user-avatar';
import { adminListUsers, type AdminUserRow } from '@/services/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Users' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FILTERS = [
  { id: '', label: 'All users' },
  { id: 'premium', label: 'Premium' },
  { id: 'admin', label: 'Admins' },
  { id: 'editor', label: 'Editors' },
  { id: 'suspended', label: 'Suspended' },
] as const;

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  await requireStrictAdminPage();
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const filter = first(raw.filter) ?? '';
  const query = first(raw.q);
  const page = Number.parseInt(first(raw.page) ?? '1', 10) || 1;

  const result = await adminListUsers({
    page,
    pageSize: 25,
    q: query,
    premium: filter === 'premium' ? true : undefined,
    role: filter === 'admin' ? 'admin' : filter === 'editor' ? 'editor' : undefined,
    status: filter === 'suspended' ? 'suspended' : undefined,
  });

  const columns: Column<AdminUserRow>[] = [
    {
      key: 'user',
      header: 'User',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <UserAvatar name={row.name} size={32} isPremium={Boolean(row.planName)} />
          <CellStack primary={row.name} secondary={row.email} />
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      hideOnMobile: true,
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.roles.length === 0 ? (
            <Badge tone="neutral">user</Badge>
          ) : (
            row.roles.map((role) => (
              <Badge key={role} tone={role === 'admin' ? 'brand' : 'neutral'}>
                {role}
              </Badge>
            ))
          )}
        </div>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (row) =>
        row.planName ? (
          <div className="flex flex-col gap-1">
            <PremiumBadge />
            {row.subscriptionEndsAt && (
              <span className="text-[0.6875rem] text-faint">
                until {formatDate(row.subscriptionEndsAt)}
              </span>
            )}
          </div>
        ) : (
          <Badge tone="neutral">Free</Badge>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-col gap-1">
          <Badge tone={row.status === 'active' ? 'success' : 'rose'}>{row.status}</Badge>
          {!row.emailVerified && <Badge tone="marigold">Unverified</Badge>}
        </div>
      ),
    },
    {
      key: 'activity',
      header: 'Copies / Saves',
      align: 'right',
      hideOnMobile: true,
      render: (row) => (
        <span className="tabular-nums text-body">
          {row.copies} / {row.saves}
        </span>
      ),
    },
    {
      key: 'joined',
      header: 'Joined',
      hideOnMobile: true,
      render: (row) => (
        <CellStack
          primary={<span className="text-xs font-normal">{formatDate(row.createdAt)}</span>}
          secondary={row.lastLoginAt ? `Seen ${relativeTime(row.lastLoginAt)}` : 'Never signed in'}
        />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <UserRowActions
          userId={row.id}
          name={row.name}
          status={row.status}
          roles={row.roles}
          isPremium={Boolean(row.planName)}
        />
      ),
    },
  ];

  const buildHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (filter) params.set('filter', filter);
    if (query) params.set('q', query);
    if (nextPage > 1) params.set('page', String(nextPage));
    const search = params.toString();
    return search ? `/admin/users?${search}` : '/admin/users';
  };

  return (
    <AdminShell title="Users" description={`${result.total} registered account${result.total === 1 ? '' : 's'}.`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item.id || 'all'}
            href={item.id ? `/admin/users?filter=${item.id}` : '/admin/users'}
            className={
              filter === item.id
                ? 'rounded-full bg-ink-900 px-3.5 py-1.5 text-xs font-bold text-white dark:bg-white dark:text-ink-950'
                : 'rounded-full bg-[var(--surface-sunken)] px-3.5 py-1.5 text-xs font-semibold text-body hover:text-[var(--text-primary)]'
            }
          >
            {item.label}
          </Link>
        ))}

        <form action="/admin/users" className="ml-auto flex items-center gap-2">
          {filter && <input type="hidden" name="filter" value={filter} />}
          <label htmlFor="admin-user-search" className="sr-only">
            Search users
          </label>
          <input
            id="admin-user-search"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Name, email or username…"
            className="h-9 w-56 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 text-sm focus:border-brand-500 focus:outline-none"
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
        caption="Registered users"
        columns={columns}
        rows={result.items}
        rowKey={(row) => row.id}
        empty={<AdminEmpty title="No users found" description="Try a different filter or search term." />}
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
