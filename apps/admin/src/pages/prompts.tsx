import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

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
  PageHeader,
  Row,
  Select,
  Spinner,
  Table,
  cn,
  formatDateTime,
  formatNumber,
} from '@/components/ui';
import { AI_MODELS } from '@pd/shared';
import { api, qs } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/use-api';

/**
 * Prompt library.
 *
 * Every action here used to be single-row: publishing forty drafts meant forty
 * clicks and forty round trips, re-filing a mis-categorised group was impossible,
 * and the featured/trending badges were display-only even though a dedicated
 * flags endpoint existed and was never called. With the automation pipeline now
 * producing prompts in batches, per-row-only editing stopped being viable.
 *
 * Two additions do most of the work:
 *
 *   selection    A checkbox column plus a bulk bar that appears only when
 *                something is selected, so the table is not permanently topped by
 *                a row of disabled buttons.
 *   flag toggles The badges are now buttons, hitting `PATCH /prompts/:id/flags`.
 *                Featuring a post was previously a five-step trip through the
 *                editor for a one-bit change.
 *
 * Selection is intentionally *not* preserved across pages or filter changes. A
 * hidden selection is how someone deletes fifty rows they cannot see.
 */

interface AdminPromptRow {
  id: string;
  title: string;
  slug: string;
  aiModel: string;
  categoryName: string;
  isPublished: boolean;
  isPremium: boolean;
  isTrending: boolean;
  isFeatured: boolean;
  scheduledFor: number | null;
  viewCount: number;
  copyCount: number;
  likeCount: number;
  updatedAt: number;
  createdAt: number;
}

interface PromptListResponse {
  items: AdminPromptRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
}

/** Converts a datetime-local value to unix seconds. */
function toUnix(value: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

type BulkPanel = 'category' | 'tags' | 'schedule' | null;

export function PromptsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [model, setModel] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<BulkPanel>(null);
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkTags, setBulkTags] = useState('');
  const [bulkTagMode, setBulkTagMode] = useState<'add' | 'remove'>('add');
  const [bulkSchedule, setBulkSchedule] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const categories = useQuery<{ items: CategoryRow[] }>('/v1/admin/categories');
  const prompts = useQuery<PromptListResponse>(
    `/v1/admin/prompts${qs({ q: search, status, model, category, page, pageSize: 25 })}`,
    [status, model, category, page],
  );
  const { run, pending, error } = useMutation();

  const rows = prompts.data?.items ?? [];
  const selectedIds = [...selected].filter((id) => rows.some((row) => row.id === id));
  const totalPages = prompts.data
    ? Math.max(1, Math.ceil(prompts.data.total / prompts.data.pageSize))
    : 1;

  function clearSelection() {
    setSelected(new Set());
    setPanel(null);
    setBulkTags('');
    setBulkSchedule('');
    setBulkCategory('');
  }

  function afterChange(message: string) {
    clearSelection();
    setNotice(message);
    prompts.reload();
  }

  /** Filter changes invalidate the selection — see the note at the top. */
  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
    clearSelection();
  }

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /* ------------------------------ Single row ------------------------------ */

  async function togglePublished(prompt: AdminPromptRow) {
    const ok = await run(() =>
      api.patch(`/v1/admin/prompts/${encodeURIComponent(prompt.id)}/publish`, {
        isPublished: !prompt.isPublished,
      }),
    );
    if (ok !== null) prompts.reload();
  }

  /** One-bit changes go straight to the flags endpoint, not through the editor. */
  async function toggleFlag(
    prompt: AdminPromptRow,
    flag: 'isFeatured' | 'isTrending' | 'isPremium',
  ) {
    const ok = await run(() =>
      api.patch(`/v1/admin/prompts/${encodeURIComponent(prompt.id)}/flags`, {
        [flag]: !prompt[flag],
      }),
    );
    if (ok !== null) prompts.reload();
  }

  async function remove(prompt: AdminPromptRow) {
    if (!window.confirm(`Delete "${prompt.title}"? This cannot be undone.`)) return;
    const ok = await run(() => api.delete(`/v1/admin/prompts/${encodeURIComponent(prompt.id)}`));
    if (ok !== null) prompts.reload();
  }

  /* --------------------------------- Bulk --------------------------------- */

  async function bulkPublish(isPublished: boolean) {
    const result = await run(() =>
      api.post<{ affected: number }>('/v1/admin/prompts/bulk/publish', {
        ids: selectedIds,
        isPublished,
      }),
    );
    if (result) {
      afterChange(`${isPublished ? 'Published' : 'Unpublished'} ${result.affected} prompt(s).`);
    }
  }

  async function bulkFlag(flag: 'isFeatured' | 'isTrending' | 'isPremium', value: boolean) {
    const result = await run(() =>
      api.post<{ affected: number }>('/v1/admin/prompts/bulk/flags', {
        ids: selectedIds,
        [flag]: value,
      }),
    );
    if (result) afterChange(`Updated ${result.affected} prompt(s).`);
  }

  async function bulkDelete() {
    if (!window.confirm(`Delete ${selectedIds.length} prompt(s)? This cannot be undone.`)) return;
    const result = await run(() =>
      api.post<{ affected: number }>('/v1/admin/prompts/bulk/delete', { ids: selectedIds }),
    );
    if (result) afterChange(`Deleted ${result.affected} prompt(s).`);
  }

  async function applyCategory() {
    const result = await run(() =>
      api.post<{ affected: number }>('/v1/admin/prompts/bulk/category', {
        ids: selectedIds,
        categoryId: bulkCategory,
      }),
    );
    if (result) afterChange(`Moved ${result.affected} prompt(s).`);
  }

  async function applyTags() {
    const tags = bulkTags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (tags.length === 0) return;

    const result = await run(() =>
      api.post<{ affected: number }>('/v1/admin/prompts/bulk/tags', {
        ids: selectedIds,
        tags,
        mode: bulkTagMode,
      }),
    );
    if (result) {
      afterChange(
        `${bulkTagMode === 'add' ? 'Tagged' : 'Untagged'} ${result.affected} prompt(s).`,
      );
    }
  }

  async function applySchedule(clear: boolean) {
    const scheduledFor = clear ? null : toUnix(bulkSchedule);
    if (!clear && !scheduledFor) return;

    const result = await run(() =>
      api.post<{ affected: number }>('/v1/admin/prompts/bulk/schedule', {
        ids: selectedIds,
        scheduledFor,
      }),
    );
    if (result) {
      afterChange(
        clear
          ? `Cleared the schedule on ${result.affected} prompt(s).`
          : `Scheduled ${result.affected} prompt(s).`,
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Prompts"
        description={
          prompts.data ? `${formatNumber(prompts.data.total)} prompts in the library.` : undefined
        }
        actions={<Button onClick={() => navigate('/prompts/new')}>New prompt</Button>}
      />

      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card className="mb-4">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            clearSelection();
            prompts.reload();
          }}
        >
          <Input
            placeholder="Search title or body…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="lg:col-span-2"
          />
          <Select value={status} onChange={(event) => changeFilter(() => setStatus(event.target.value))}>
            <option value="">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </Select>
          <Select value={model} onChange={(event) => changeFilter(() => setModel(event.target.value))}>
            <option value="">All models</option>
            {AI_MODELS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </Select>
          <Select
            value={category}
            onChange={(event) => changeFilter(() => setCategory(event.target.value))}
          >
            <option value="">All categories</option>
            {(categories.data?.items ?? []).map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </Select>
        </form>
      </Card>

      {selectedIds.length > 0 && (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-900 dark:bg-brand-950/40">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-1 text-sm font-semibold text-[var(--text-strong)]">
              {selectedIds.length} selected
            </p>
            <Button size="sm" disabled={pending} onClick={() => void bulkPublish(true)}>
              Publish
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => void bulkPublish(false)}>
              Unpublish
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPanel(panel === 'schedule' ? null : 'schedule')}
            >
              Schedule…
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPanel(panel === 'category' ? null : 'category')}
            >
              Move…
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPanel(panel === 'tags' ? null : 'tags')}
            >
              Tags…
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => void bulkFlag('isFeatured', true)}>
              Feature
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => void bulkFlag('isPremium', true)}>
              Make premium
            </Button>
            <Button variant="danger" size="sm" disabled={pending} onClick={() => void bulkDelete()}>
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          </div>

          {panel === 'schedule' && (
            <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-brand-200 pt-3 dark:border-brand-900">
              <Field
                label="Publish at"
                hint="Scheduled prompts go live on the hourly sweep. They are unpublished until then."
              >
                <Input
                  type="datetime-local"
                  value={bulkSchedule}
                  onChange={(event) => setBulkSchedule(event.target.value)}
                />
              </Field>
              <Button size="sm" disabled={pending || !bulkSchedule} onClick={() => void applySchedule(false)}>
                Apply
              </Button>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => void applySchedule(true)}>
                Clear schedule
              </Button>
            </div>
          )}

          {panel === 'category' && (
            <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-brand-200 pt-3 dark:border-brand-900">
              <Field label="Move to category">
                <Select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)}>
                  <option value="">Choose a category…</option>
                  {(categories.data?.items ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button size="sm" disabled={pending || !bulkCategory} onClick={() => void applyCategory()}>
                Move
              </Button>
            </div>
          )}

          {panel === 'tags' && (
            <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-brand-200 pt-3 dark:border-brand-900">
              <Field label="Tags" hint="Comma separated. Adding creates any that do not exist.">
                <Input
                  value={bulkTags}
                  onChange={(event) => setBulkTags(event.target.value)}
                  placeholder="diwali, couple, rooftop"
                />
              </Field>
              <Field label="Mode">
                <Select
                  value={bulkTagMode}
                  onChange={(event) => setBulkTagMode(event.target.value as 'add' | 'remove')}
                >
                  <option value="add">Add to selected</option>
                  <option value="remove">Remove from selected</option>
                </Select>
              </Field>
              <Button size="sm" disabled={pending || !bulkTags.trim()} onClick={() => void applyTags()}>
                Apply
              </Button>
            </div>
          )}
        </div>
      )}

      <Card>
        {prompts.error && <Alert>{prompts.error}</Alert>}
        {prompts.loading && !prompts.data && <Spinner label="Loading prompts" />}

        {prompts.data && rows.length === 0 && (
          <EmptyState>No prompts match these filters.</EmptyState>
        )}

        {rows.length > 0 && (
          <Table
            head={[
              <Checkbox
                key="all"
                label=""
                aria-label="Select all on this page"
                checked={selectedIds.length === rows.length}
                onChange={(event) =>
                  setSelected(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set())
                }
              />,
              'Prompt',
              'Model',
              'Category',
              'Stats',
              'Updated',
              '',
            ]}
          >
            {rows.map((prompt) => (
              <Row key={prompt.id}>
                <Cell>
                  <Checkbox
                    label=""
                    aria-label={`Select ${prompt.title}`}
                    checked={selected.has(prompt.id)}
                    onChange={() => toggle(prompt.id)}
                  />
                </Cell>

                <Cell>
                  <Link
                    to={`/prompts/${prompt.id}`}
                    className="font-semibold text-[var(--text-strong)] hover:text-brand-600"
                  >
                    {prompt.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge tone={prompt.isPublished ? 'success' : 'warning'}>
                      {prompt.isPublished ? 'Published' : 'Draft'}
                    </Badge>

                    {/* Clickable flags. These were read-only badges while the
                        flags endpoint sat unused. */}
                    <FlagToggle
                      label="Premium"
                      active={prompt.isPremium}
                      disabled={pending}
                      onClick={() => void toggleFlag(prompt, 'isPremium')}
                    />
                    <FlagToggle
                      label="Featured"
                      active={prompt.isFeatured}
                      disabled={pending}
                      onClick={() => void toggleFlag(prompt, 'isFeatured')}
                    />
                    <FlagToggle
                      label="Trending"
                      active={prompt.isTrending}
                      disabled={pending}
                      onClick={() => void toggleFlag(prompt, 'isTrending')}
                    />

                    {prompt.scheduledFor && !prompt.isPublished && (
                      <Badge tone="brand">
                        Goes live {formatDateTime(prompt.scheduledFor)}
                      </Badge>
                    )}
                  </div>
                </Cell>

                <Cell>{prompt.aiModel}</Cell>
                <Cell>{prompt.categoryName}</Cell>
                <Cell className="whitespace-nowrap text-xs">
                  {formatNumber(prompt.viewCount)} views
                  <br />
                  {formatNumber(prompt.copyCount)} copies
                </Cell>
                <Cell className="whitespace-nowrap text-xs">{formatDateTime(prompt.updatedAt)}</Cell>

                <Cell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => void togglePublished(prompt)}
                    >
                      {prompt.isPublished ? 'Unpublish' : 'Publish'}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => void remove(prompt)}>
                      Delete
                    </Button>
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}

        {prompts.data && totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => {
                setPage((p) => Math.max(1, p - 1));
                clearSelection();
              }}
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
              onClick={() => {
                setPage((p) => p + 1);
                clearSelection();
              }}
            >
              Next
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}

/**
 * A badge that is also a button.
 *
 * Styled to read as inactive when off, so the row still scans as a list of states
 * rather than a row of identical controls — but every one is clickable, which is
 * the whole point.
 */
function FlagToggle({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={active ? `Remove ${label.toLowerCase()}` : `Mark as ${label.toLowerCase()}`}
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        active
          ? 'bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-950/60 dark:text-brand-200'
          : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-body)]',
      )}
    >
      {label}
    </button>
  );
}
