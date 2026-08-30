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
  cn,
  formatDate,
  formatNumber,
} from '@/components/ui';
import { api, qs } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/use-api';

/**
 * Tag management.
 *
 * Tags used to be write-only. The only code that touched them created any it had
 * not seen before, whenever a prompt was saved, and nothing anywhere could rename,
 * merge or remove one — so the vocabulary could only grow. That was tolerable
 * while a human typed every tag and became a real problem the moment the
 * automation pipeline started writing them: a model asked for tags across a
 * thousand prompts will produce "pre wedding", "pre-wedding" and "prewedding",
 * and each one becomes a public facet with its own thin listing page competing
 * with the others in search.
 *
 * Merge is therefore the primary action on this screen, not delete. The flow is
 * built around it: multi-select the variants, then pick the spelling to keep.
 *
 * The `usageCount` / `actualCount` split deserves an explanation. The first is
 * denormalised onto the row and is what the public tag cloud reads; the second is
 * counted live from `prompt_tags`. Showing both means a drifted counter is visible
 * rather than silently misreporting, and the Recount action fixes it.
 */

interface TagRow {
  id: string;
  name: string;
  slug: string;
  usageCount: number;
  actualCount: number;
  createdAt: number;
}

interface TagListResponse {
  items: TagRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface TaggedPrompt {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
}

export function TagsPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unused'>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [renaming, setRenaming] = useState<TagRow | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [merging, setMerging] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [inspecting, setInspecting] = useState<TagRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const tags = useQuery<TagListResponse>(
    `/v1/admin/tags${qs({
      q: search || undefined,
      unusedOnly: filter === 'unused' ? 'true' : undefined,
      page,
      pageSize: 50,
    })}`,
    [search, filter, page],
  );

  const inspected = useQuery<{ items: TaggedPrompt[] }>(
    inspecting ? `/v1/admin/tags/${encodeURIComponent(inspecting.id)}/prompts` : null,
    [inspecting?.id],
  );

  const action = useMutation();

  const rows = tags.data?.items ?? [];
  const selectedRows = rows.filter((row) => selected.has(row.id));
  const totalPages = tags.data ? Math.max(1, Math.ceil(tags.data.total / tags.data.pageSize)) : 1;
  const drifted = rows.filter((row) => row.usageCount !== row.actualCount).length;

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset(message?: string) {
    setSelected(new Set());
    setRenaming(null);
    setMerging(false);
    setMergeTargetId('');
    setCreating(false);
    setNewName('');
    if (message) setNotice(message);
    tags.reload();
  }

  async function runRename() {
    if (!renaming) return;
    const result = await action.run(() =>
      api.patch<TagRow>(`/v1/admin/tags/${encodeURIComponent(renaming.id)}`, {
        name: renameValue,
      }),
    );
    if (result) reset(`Renamed to "${result.name}" (/${result.slug}).`);
  }

  async function runMerge() {
    if (!mergeTargetId) return;
    const sourceIds = selectedRows.map((row) => row.id).filter((id) => id !== mergeTargetId);
    if (sourceIds.length === 0) return;

    const result = await action.run(() =>
      api.post<{ targetName: string; mergedTagCount: number; repointed: number; duplicatesDropped: number }>(
        '/v1/admin/tags/merge',
        { targetId: mergeTargetId, sourceIds },
      ),
    );
    if (result) {
      reset(
        `Merged ${result.mergedTagCount} tag(s) into "${result.targetName}": ${result.repointed} prompt(s) repointed, ${result.duplicatesDropped} duplicate link(s) dropped.`,
      );
    }
  }

  async function runDelete(row: TagRow) {
    const attached = row.actualCount;
    const message = attached
      ? `"${row.name}" is on ${attached} prompt(s). Remove it from all of them?`
      : `Delete "${row.name}"?`;
    if (!window.confirm(message)) return;

    const ok = await action.run(() =>
      api.delete(`/v1/admin/tags/${encodeURIComponent(row.id)}${attached ? '?force=true' : ''}`),
    );
    if (ok !== null) reset(`Deleted "${row.name}".`);
  }

  async function runPrune() {
    if (!window.confirm('Delete every tag that is not attached to any prompt?')) return;
    const result = await action.run(() =>
      api.post<{ removed: number }>('/v1/admin/tags/prune', {}),
    );
    if (result) reset(`Removed ${result.removed} unused tag(s).`);
  }

  async function runRecount() {
    const result = await action.run(() =>
      api.post<{ checked: number }>('/v1/admin/tags/recount', {}),
    );
    if (result) reset(`Recounted ${result.checked} tag(s).`);
  }

  async function runCreate() {
    const result = await action.run(() => api.post<TagRow>('/v1/admin/tags', { name: newName }));
    if (result) reset(`Created "${result.name}".`);
  }

  return (
    <>
      <PageHeader
        title="Tags"
        description={
          tags.data
            ? `${formatNumber(tags.data.total)} tags. Merge duplicates rather than deleting them — a merge keeps the prompts.`
            : undefined
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              New tag
            </Button>
            <Button variant="outline" size="sm" loading={action.pending} onClick={() => void runRecount()}>
              Recount
            </Button>
            <Button variant="outline" size="sm" loading={action.pending} onClick={() => void runPrune()}>
              Prune unused
            </Button>
          </div>
        }
      />

      {action.error && <Alert>{action.error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {drifted > 0 && (
        <div className="mb-4">
          <Alert tone="warning">
            {drifted} tag(s) on this page have a stored count that disagrees with the number of
            prompts actually carrying them. Press Recount to repair it.
          </Alert>
        </div>
      )}

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            placeholder="Search tags…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="sm:col-span-2"
          />
          <Select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as 'all' | 'unused');
              setPage(1);
            }}
          >
            <option value="all">All tags</option>
            <option value="unused">Unused only</option>
          </Select>
        </div>
      </Card>

      {/* Bulk bar. Appears only with a selection, so the table is not permanently
          topped by a row of disabled buttons. */}
      {selectedRows.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-900 dark:bg-brand-950/40">
          <p className="text-sm font-semibold text-[var(--text-strong)]">
            {selectedRows.length} selected
          </p>
          <Button
            size="sm"
            disabled={selectedRows.length < 2}
            onClick={() => {
              // Default the survivor to the most used tag — nearly always the
              // spelling to keep, and it saves a decision in the common case.
              const best = [...selectedRows].sort((a, b) => b.actualCount - a.actualCount)[0];
              setMergeTargetId(best?.id ?? '');
              setMerging(true);
            }}
          >
            Merge {selectedRows.length}…
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
          {selectedRows.length < 2 && (
            <p className="text-xs text-[var(--text-muted)]">Select at least two tags to merge.</p>
          )}
        </div>
      )}

      <Card>
        {tags.error && <Alert>{tags.error}</Alert>}
        {tags.loading && !tags.data && <Spinner label="Loading tags" />}

        {tags.data && rows.length === 0 && (
          <EmptyState>
            {filter === 'unused' ? 'No unused tags — nothing to prune.' : 'No tags match.'}
          </EmptyState>
        )}

        {rows.length > 0 && (
          <Table
            head={[
              <Checkbox
                key="all"
                label=""
                aria-label="Select all on this page"
                checked={selectedRows.length === rows.length}
                onChange={(event) =>
                  setSelected(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set())
                }
              />,
              'Tag',
              'Slug',
              'Prompts',
              'Created',
              '',
            ]}
          >
            {rows.map((row) => (
              <Row key={row.id}>
                <Cell>
                  <Checkbox
                    label=""
                    aria-label={`Select ${row.name}`}
                    checked={selected.has(row.id)}
                    onChange={() => toggle(row.id)}
                  />
                </Cell>

                <Cell>
                  <span className="text-sm font-semibold text-[var(--text-strong)]">{row.name}</span>
                  {row.actualCount === 0 && (
                    <Badge tone="warning">
                      <span className="ml-0">unused</span>
                    </Badge>
                  )}
                </Cell>

                <Cell>
                  <code className="text-xs text-[var(--text-muted)]">/{row.slug}</code>
                </Cell>

                <Cell>
                  <button
                    type="button"
                    disabled={row.actualCount === 0}
                    onClick={() => setInspecting(row)}
                    className={cn(
                      'tabular text-sm font-semibold',
                      row.actualCount === 0
                        ? 'cursor-default text-[var(--text-muted)]'
                        : 'text-[var(--text-strong)] hover:text-brand-600',
                    )}
                  >
                    {formatNumber(row.actualCount)}
                  </button>
                  {row.usageCount !== row.actualCount && (
                    <p
                      className="text-[0.625rem] text-amber-600 dark:text-amber-400"
                      title="The cached count the public site reads disagrees with the real one"
                    >
                      cached {formatNumber(row.usageCount)}
                    </p>
                  )}
                </Cell>

                <Cell className="whitespace-nowrap text-xs">{formatDate(row.createdAt)}</Cell>

                <Cell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRenaming(row);
                        setRenameValue(row.name);
                      }}
                    >
                      Rename
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void runDelete(row)}>
                      Delete
                    </Button>
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <p className="text-xs text-[var(--text-muted)]">
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

      {/* --------------------------------- Modals -------------------------------- */}

      {creating && (
        <Modal title="New tag" onClose={() => setCreating(false)}>
          <Field
            label="Name"
            hint="Creating a tag up front lets you settle on preferred wording before anything is tagged with a variant."
          >
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="pre wedding"
              autoFocus
            />
          </Field>
          {action.error && (
            <div className="mt-3">
              <Alert>{action.error}</Alert>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button loading={action.pending} disabled={!newName.trim()} onClick={() => void runCreate()}>
              Create
            </Button>
          </div>
        </Modal>
      )}

      {renaming && (
        <Modal title={`Rename "${renaming.name}"`} onClose={() => setRenaming(null)}>
          <Field
            label="Name"
            hint="The slug changes with the name, so this tag's public URL will change too."
          >
            <Input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              autoFocus
            />
          </Field>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            On {formatNumber(renaming.actualCount)} prompt(s). Renaming keeps every one of them.
          </p>
          {action.error && (
            <div className="mt-3">
              <Alert>{action.error}</Alert>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              loading={action.pending}
              disabled={!renameValue.trim() || renameValue === renaming.name}
              onClick={() => void runRename()}
            >
              Rename
            </Button>
          </div>
        </Modal>
      )}

      {merging && (
        <Modal title={`Merge ${selectedRows.length} tags`} onClose={() => setMerging(false)}>
          <Field label="Keep this one" hint="The others are deleted and their prompts repointed here.">
            <Select value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)}>
              <option value="">Choose the tag to keep…</option>
              {selectedRows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} ({formatNumber(row.actualCount)} prompts)
                </option>
              ))}
            </Select>
          </Field>

          <div className="mt-3 rounded-lg bg-[var(--surface-sunken)] p-3">
            <p className="text-xs font-semibold text-[var(--text-muted)]">Will be deleted</p>
            <ul className="mt-1 space-y-0.5">
              {selectedRows
                .filter((row) => row.id !== mergeTargetId)
                .map((row) => (
                  <li key={row.id} className="text-sm text-[var(--text-body)]">
                    {row.name}{' '}
                    <span className="text-xs text-[var(--text-muted)]">
                      ({formatNumber(row.actualCount)} prompts)
                    </span>
                  </li>
                ))}
            </ul>
          </div>

          <p className="mt-3 text-xs text-[var(--text-muted)]">
            No prompt loses a tag: any prompt carrying a deleted tag gains the one you keep. Prompts
            that already had both simply keep it once.
          </p>

          {action.error && (
            <div className="mt-3">
              <Alert>{action.error}</Alert>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMerging(false)}>
              Cancel
            </Button>
            <Button loading={action.pending} disabled={!mergeTargetId} onClick={() => void runMerge()}>
              Merge
            </Button>
          </div>
        </Modal>
      )}

      {inspecting && (
        <Modal title={`Prompts tagged "${inspecting.name}"`} onClose={() => setInspecting(null)} wide>
          {inspected.loading && !inspected.data && <Spinner label="Loading prompts" />}
          {inspected.data && inspected.data.items.length === 0 && (
            <EmptyState>Nothing carries this tag.</EmptyState>
          )}
          {inspected.data && inspected.data.items.length > 0 && (
            <ul className="space-y-1">
              {inspected.data.items.map((prompt) => (
                <li
                  key={prompt.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-hover)]"
                >
                  <a
                    href={`/prompts/${prompt.id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-strong)] hover:text-brand-600"
                  >
                    {prompt.title}
                  </a>
                  <Badge tone={prompt.isPublished ? 'success' : 'neutral'}>
                    {prompt.isPublished ? 'Published' : 'Draft'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </>
  );
}
