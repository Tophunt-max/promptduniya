import { useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Card,
  Cell,
  EmptyState,
  Input,
  PageHeader,
  Row,
  Select,
  Spinner,
  Table,
  cn,
  formatDateTime,
} from '@/components/ui';
import { qs } from '@/lib/api';
import { useQuery } from '@/lib/use-api';

/**
 * Audit log.
 *
 * Every mutating admin endpoint has called `logAdminAction` since the API was
 * written — thirty-odd call sites recording actor, action, target and IP — and
 * none of it was viewable. `GET /v1/admin/logs` existed with no consumer, so the
 * console was accumulating an audit trail that only someone with database access
 * could read. For a platform with multiple editors and an automation pipeline
 * making its own changes, "who unpublished this" was unanswerable from the tool
 * that did it.
 *
 * Two things this screen has to get right:
 *
 *   grouping    Raw action strings are namespaced (`prompt.seo.regenerate`,
 *               `tag.merge`, `prompts.bulk.publish`). Filtering on the namespace
 *               is what an operator actually wants — "show me everything that
 *               touched billing" — so the prefix drives the filter and the full
 *               string is shown verbatim.
 *   metadata    `meta_json` is where the interesting detail lives and its shape
 *               differs per action, so it is rendered as inspectable key/value
 *               pairs rather than forced into columns that would be empty for
 *               most rows.
 */

interface LogRow {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metaJson: string | null;
  ipHash: string | null;
  createdAt: number;
}

/**
 * Namespaces worth filtering by, derived from the action strings the API emits.
 *
 * Hardcoded rather than discovered from the data: a dropdown built from whatever
 * happens to be in the current page of results changes as you paginate, which is
 * a genuinely disorienting filter control.
 */
const SCOPES = [
  { prefix: '', label: 'All activity' },
  { prefix: 'prompt', label: 'Prompts' },
  { prefix: 'studio', label: 'AI Studio' },
  { prefix: 'automation', label: 'Automation' },
  { prefix: 'tag', label: 'Tags' },
  { prefix: 'category', label: 'Categories' },
  { prefix: 'article', label: 'Articles' },
  { prefix: 'media', label: 'Media' },
  { prefix: 'user', label: 'Users' },
  { prefix: 'plan', label: 'Plans' },
  { prefix: 'coupon', label: 'Coupons' },
  { prefix: 'subscription', label: 'Subscriptions' },
  { prefix: 'broadcast', label: 'Broadcasts' },
  { prefix: 'settings', label: 'Settings' },
  { prefix: 'images', label: 'Images' },
];

/** Actions that change what the public can see, or that cannot be undone. */
const HIGH_IMPACT = /delete|prune|merge|broadcast|cancel|bulk|revoke|suspend/i;

function tone(action: string): 'neutral' | 'warning' | 'danger' | 'success' | 'brand' {
  if (/delete|prune|revoke|suspend|cancel/i.test(action)) return 'danger';
  if (/bulk|merge|broadcast/i.test(action)) return 'warning';
  if (/create|publish|grant|generate/i.test(action)) return 'success';
  if (/automation|studio/i.test(action)) return 'brand';
  return 'neutral';
}

function safeParse(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Renders a metadata value without dumping a whole nested object into a cell. */
function short(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.length > 80 ? `${value.slice(0, 80)}…` : value;
  if (Array.isArray(value)) return value.length === 0 ? '[]' : `${value.length} item(s)`;
  return '{…}';
}

export function LogsPage() {
  const [scope, setScope] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const logs = useQuery<{ items: LogRow[] }>(
    `/v1/admin/logs${qs({ page, pageSize: 100 })}`,
    [page],
  );

  // Filtered client-side. The endpoint takes only pagination, and adding server
  // filters for a table an operator scans a page at a time would be more
  // machinery than the problem needs — 100 rows is already more than fits on a
  // screen.
  const rows = (logs.data?.items ?? []).filter((row) => {
    if (scope && !row.action.startsWith(scope)) return false;
    if (!search) return true;
    const needle = search.toLowerCase();
    return (
      row.action.toLowerCase().includes(needle) ||
      (row.actorEmail ?? '').toLowerCase().includes(needle) ||
      (row.actorName ?? '').toLowerCase().includes(needle) ||
      (row.targetId ?? '').toLowerCase().includes(needle) ||
      (row.metaJson ?? '').toLowerCase().includes(needle)
    );
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change made through the console, and by whom. Machine activity is logged separately under Automation."
        actions={
          <Button variant="outline" size="sm" onClick={logs.reload}>
            Refresh
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            className="sm:col-span-1"
          >
            {SCOPES.map((entry) => (
              <option key={entry.prefix || 'all'} value={entry.prefix}>
                {entry.label}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Search action, actor, target or metadata…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="sm:col-span-2"
          />
        </div>
      </Card>

      <Card>
        {logs.error && <Alert>{logs.error}</Alert>}
        {logs.loading && !logs.data && <Spinner label="Loading activity" />}

        {logs.data && rows.length === 0 && (
          <EmptyState>
            {logs.data.items.length === 0
              ? 'Nothing has been logged yet.'
              : 'No entries match these filters.'}
          </EmptyState>
        )}

        {rows.length > 0 && (
          <Table head={['When', 'Actor', 'Action', 'Target', 'Detail']}>
            {rows.map((row) => {
              const meta = safeParse(row.metaJson);
              const isOpen = expanded === row.id;
              const entries = meta ? Object.entries(meta) : [];

              return (
                <Row key={row.id}>
                  <Cell className="whitespace-nowrap text-xs">{formatDateTime(row.createdAt)}</Cell>

                  <Cell>
                    {row.actorName || row.actorEmail ? (
                      <>
                        <p className="text-sm font-medium text-[var(--text-strong)]">
                          {row.actorName ?? '—'}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">{row.actorEmail}</p>
                      </>
                    ) : (
                      // A null actor is the system acting on its own — a cron
                      // tick, or a webhook. Worth naming rather than leaving blank.
                      <span className="text-xs text-[var(--text-muted)]">System</span>
                    )}
                  </Cell>

                  <Cell>
                    <Badge tone={tone(row.action)}>{row.action}</Badge>
                    {HIGH_IMPACT.test(row.action) && (
                      <span
                        className="ml-1.5 text-[0.625rem] font-bold uppercase text-amber-600 dark:text-amber-400"
                        title="This action changed or removed data in bulk"
                      >
                        impact
                      </span>
                    )}
                  </Cell>

                  <Cell className="text-xs">
                    {row.targetType ? (
                      <>
                        <span className="text-[var(--text-muted)]">{row.targetType}</span>
                        {row.targetId && (
                          <>
                            <br />
                            <code className="text-[0.625rem]">{row.targetId}</code>
                          </>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </Cell>

                  <Cell>
                    {entries.length === 0 ? (
                      <span className="text-xs text-[var(--text-muted)]">—</span>
                    ) : (
                      <div>
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : row.id)}
                          className={cn(
                            'text-xs font-semibold transition-colors',
                            isOpen
                              ? 'text-brand-600'
                              : 'text-[var(--text-muted)] hover:text-[var(--text-strong)]',
                          )}
                        >
                          {isOpen ? 'Hide' : `${entries.length} field(s)`}
                        </button>

                        {isOpen && (
                          <dl className="mt-1.5 space-y-0.5 rounded-lg bg-[var(--surface-sunken)] p-2">
                            {entries.map(([key, value]) => (
                              <div key={key} className="flex gap-2 text-[0.6875rem]">
                                <dt className="shrink-0 font-semibold text-[var(--text-muted)]">
                                  {key}
                                </dt>
                                <dd className="min-w-0 break-words text-[var(--text-body)]">
                                  {short(value)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>
                    )}
                  </Cell>
                </Row>
              );
            })}
          </Table>
        )}

        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Newer
          </Button>
          <p className="text-xs text-[var(--text-muted)]">
            Page {page}
            {scope || search ? ` · ${rows.length} shown of ${logs.data?.items.length ?? 0}` : ''}
          </p>
          <Button
            variant="outline"
            size="sm"
            // The endpoint returns a page without a total, so "next" is offered
            // whenever the page came back full.
            disabled={(logs.data?.items.length ?? 0) < 100}
            onClick={() => setPage((p) => p + 1)}
          >
            Older
          </Button>
        </div>
      </Card>
    </>
  );
}
