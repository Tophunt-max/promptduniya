import { useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Card,
  Cell,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Row,
  Select,
  Spinner,
  Table,
  formatDate,
  formatNumber,
} from '@/components/ui';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMutation, useQuery } from '@/lib/use-api';

interface UserRow {
  id: string;
  name: string;
  email: string;
  username: string;
  status: string;
  emailVerified: boolean;
  roles: string[];
  planName: string | null;
  subscriptionStatus: string | null;
  subscriptionEndsAt: number | null;
  copies: number;
  saves: number;
  createdAt: number;
  lastLoginAt: number | null;
}

interface UserListResponse {
  items: UserRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Shape of `GET /v1/admin/users/:id`. The password hash never leaves the API. */
interface UserDetail {
  user: {
    id: string;
    name: string;
    email: string;
    username: string | null;
    status: string;
    emailVerifiedAt: number | null;
    bio: string | null;
    avatarUrl: string | null;
    premiumCachedUntil: number | null;
    oauthProvider: string | null;
    lastLoginAt: number | null;
    failedLoginCount: number;
    lockedUntil: number | null;
    createdAt: number;
  };
  roles: string[];
  stats: { likes: number; saves: number; copies: number };
}

const ROLES = ['user', 'editor', 'admin'] as const;

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [premium, setPremium] = useState(false);
  const [page, setPage] = useState(1);
  const [inspecting, setInspecting] = useState<string | null>(null);

  const users = useQuery<UserListResponse>(
    `/v1/admin/users${qs({ q: search, status, role, premium: premium ? 1 : '', page, pageSize: 25 })}`,
  );
  const detail = useQuery<UserDetail>(
    inspecting ? `/v1/admin/users/${encodeURIComponent(inspecting)}` : null,
    [inspecting],
  );
  const { run, pending, error } = useMutation();

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [grantDays, setGrantDays] = useState(0);

  const totalPages = users.data
    ? Math.max(1, Math.ceil(users.data.total / users.data.pageSize))
    : 1;

  function openEdit(row: UserRow) {
    setRoles(row.roles);
    setGrantDays(0);
    setEditing(row);
  }

  async function save() {
    if (!editing) return;
    const saved = await run(() =>
      api.patch(`/v1/admin/users/${encodeURIComponent(editing.id)}`, {
        roles,
        grantPremiumDays: grantDays > 0 ? grantDays : undefined,
      }),
    );
    if (saved !== null) {
      setEditing(null);
      users.reload();
    }
  }

  async function setStatusFor(row: UserRow, next: 'active' | 'suspended') {
    const ok = await run(() =>
      api.patch(`/v1/admin/users/${encodeURIComponent(row.id)}`, { status: next }),
    );
    if (ok !== null) users.reload();
  }

  async function revokePremium(row: UserRow) {
    if (!window.confirm(`Revoke premium for ${row.email}?`)) return;
    const ok = await run(() =>
      api.patch(`/v1/admin/users/${encodeURIComponent(row.id)}`, { revokePremium: true }),
    );
    if (ok !== null) users.reload();
  }

  return (
    <>
      <PageHeader
        title="Users"
        description={users.data ? `${formatNumber(users.data.total)} accounts.` : undefined}
      />

      {error && !editing && <Alert>{error}</Alert>}

      <Card className="mb-4">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            users.reload();
          }}
        >
          <Input
            placeholder="Search name, email or username…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </Select>
          <Select
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Any role</option>
            {ROLES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
          <Checkbox
            label="Premium only"
            checked={premium}
            onChange={(event) => {
              setPremium(event.target.checked);
              setPage(1);
            }}
          />
        </form>
      </Card>

      <Card>
        {users.error && <Alert>{users.error}</Alert>}
        {users.loading && !users.data && <Spinner label="Loading users" />}
        {users.data?.items.length === 0 && <EmptyState>No users match these filters.</EmptyState>}

        {users.data && users.data.items.length > 0 && (
          <Table head={['Member', 'Roles', 'Membership', 'Activity', 'Joined', '']}>
            {users.data.items.map((row) => (
              <Row key={row.id}>
                <Cell>
                  <span className="font-semibold text-ink">{row.name}</span>
                  <p className="text-xs text-muted">{row.email}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.status !== 'active' && <Badge tone="danger">{row.status}</Badge>}
                    {!row.emailVerified && <Badge tone="warning">Unverified</Badge>}
                  </div>
                </Cell>
                <Cell className="text-xs">{row.roles.join(', ') || 'user'}</Cell>
                <Cell className="whitespace-nowrap text-xs">
                  {row.planName ? (
                    <>
                      <Badge tone="brand">{row.planName}</Badge>
                      <br />
                      until {formatDate(row.subscriptionEndsAt)}
                    </>
                  ) : (
                    'Free'
                  )}
                </Cell>
                <Cell className="whitespace-nowrap text-xs">
                  {formatNumber(row.copies)} copies
                  <br />
                  {formatNumber(row.saves)} saves
                </Cell>
                <Cell className="whitespace-nowrap text-xs">{formatDate(row.createdAt)}</Cell>
                <Cell>
                  <div className="flex justify-end gap-1">
                    {/* `GET /users/:id` existed with no caller, so there was no
                        way to see a member's history before acting on them. */}
                    <Button variant="ghost" size="sm" onClick={() => setInspecting(row.id)}>
                      View
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                      Manage
                    </Button>
                    {row.id !== currentUser?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          void setStatusFor(row, row.status === 'active' ? 'suspended' : 'active')
                        }
                      >
                        {row.status === 'active' ? 'Suspend' : 'Reinstate'}
                      </Button>
                    )}
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}

        {users.data && totalPages > 1 && (
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
              Page {page} of {totalPages}
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

      {editing && (
        <Modal title={`Manage ${editing.name}`} onClose={() => setEditing(null)}>
          <div className="space-y-4">
            {error && <Alert>{error}</Alert>}

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink">Roles</legend>
              <div className="flex flex-wrap gap-3">
                {ROLES.map((item) => (
                  <Checkbox
                    key={item}
                    label={item}
                    checked={roles.includes(item)}
                    disabled={item === 'user'}
                    onChange={() =>
                      setRoles((prev) =>
                        prev.includes(item)
                          ? prev.filter((role) => role !== item)
                          : [...prev, item],
                      )
                    }
                  />
                ))}
              </div>
              {editing.id === currentUser?.id && (
                <p className="mt-2 text-xs text-muted">
                  You cannot remove your own administrator role.
                </p>
              )}
            </fieldset>

            <Field label="Grant premium (days)" hint="Leave at 0 to make no change.">
              <Input
                type="number"
                min={0}
                max={3650}
                value={grantDays}
                onChange={(e) => setGrantDays(Number(e.target.value))}
              />
            </Field>

            {editing.planName && (
              <Button
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() => void revokePremium(editing)}
              >
                Revoke premium
              </Button>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button loading={pending} onClick={() => void save()}>
                Save
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {inspecting && (
        <Modal title="Member details" onClose={() => setInspecting(null)} wide>
          {detail.loading && !detail.data && <Spinner label="Loading member" />}
          {detail.error && <Alert>{detail.error}</Alert>}

          {detail.data && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-600 text-lg font-bold text-white">
                  {detail.data.user.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--text-strong)]">{detail.data.user.name}</p>
                  <p className="text-sm text-[var(--text-muted)]">{detail.data.user.email}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {detail.data.roles.map((name) => (
                      <Badge key={name} tone={name === 'admin' ? 'danger' : 'brand'}>
                        {name}
                      </Badge>
                    ))}
                    <Badge tone={detail.data.user.status === 'active' ? 'success' : 'danger'}>
                      {detail.data.user.status}
                    </Badge>
                    <Badge tone={detail.data.user.emailVerifiedAt ? 'success' : 'warning'}>
                      {detail.data.user.emailVerifiedAt ? 'Email verified' : 'Email unverified'}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Stat label="Copies" value={formatNumber(detail.data.stats.copies)} />
                <Stat label="Saves" value={formatNumber(detail.data.stats.saves)} />
                <Stat label="Likes" value={formatNumber(detail.data.stats.likes)} />
              </div>

              <dl className="space-y-1.5 rounded-lg bg-[var(--surface-sunken)] p-3 text-sm">
                <Detail label="Username" value={detail.data.user.username ?? '—'} />
                <Detail label="Joined" value={formatDate(detail.data.user.createdAt)} />
                <Detail
                  label="Last signed in"
                  value={detail.data.user.lastLoginAt ? formatDate(detail.data.user.lastLoginAt) : 'Never'}
                />
                <Detail
                  label="Premium until"
                  value={
                    detail.data.user.premiumCachedUntil
                      ? formatDate(detail.data.user.premiumCachedUntil)
                      : 'Not a member'
                  }
                />
                <Detail label="Sign-in method" value={detail.data.user.oauthProvider ?? 'Password'} />
                {/* Surfaced because a rising count with a lockout is the signal
                    that someone is being targeted, not that they forgot. */}
                <Detail
                  label="Failed sign-ins"
                  value={
                    detail.data.user.lockedUntil
                      ? `${detail.data.user.failedLoginCount} — locked until ${formatDate(detail.data.user.lockedUntil)}`
                      : String(detail.data.user.failedLoginCount)
                  }
                />
              </dl>

              {detail.data.user.bio && (
                <div>
                  <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    Bio
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-body)]">{detail.data.user.bio}</p>
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setInspecting(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-line)] p-2.5 text-center">
      <p className="text-[0.625rem] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="tabular mt-1 text-lg font-bold text-[var(--text-strong)]">{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="text-right font-medium text-[var(--text-strong)]">{value}</dd>
    </div>
  );
}
