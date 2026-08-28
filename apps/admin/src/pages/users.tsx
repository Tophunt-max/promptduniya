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

const ROLES = ['user', 'editor', 'admin'] as const;

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [premium, setPremium] = useState(false);
  const [page, setPage] = useState(1);

  const users = useQuery<UserListResponse>(
    `/v1/admin/users${qs({ q: search, status, role, premium: premium ? 1 : '', page, pageSize: 25 })}`,
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
    </>
  );
}
