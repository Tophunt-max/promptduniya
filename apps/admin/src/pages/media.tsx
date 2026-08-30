import { useState } from 'react';

import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  cn,
  formatDateTime,
  formatNumber,
} from '@/components/ui';
import { api, qs } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/use-api';

/**
 * Media library.
 *
 * This screen used to be an upload helper and nothing more. Its own comment said
 * so: "There is deliberately no bucket browser: R2 listing is not exposed by the
 * API." That was accurate, and it meant the gallery only ever showed what you had
 * uploaded in the current browser session — a refresh lost the list, and anything
 * uploaded yesterday was not just invisible but *undeletable*, because deleting
 * needs a key and there was no way to discover one. Files accumulated in the
 * bucket forever.
 *
 * The API now lists and deletes, so this is a real browser. Three things it has to
 * handle carefully:
 *
 *   pagination   R2's `list()` is a forward-only cursor scan; there is no way to
 *                jump to page five. The UI therefore offers "load more" rather
 *                than page numbers, which is honest about the underlying store
 *                instead of faking random access.
 *   safety       Deleting a file that is still a prompt's cover breaks that page
 *                silently — the URL keeps resolving, to nothing. So a delete
 *                checks for references first and says what it found.
 *   coverage     The image-ops panel surfaces two endpoints that existed with no
 *                UI at all: the count of prompts missing covers, and the
 *                house-model generator that photo-edit covers depend on.
 */

interface UploadConfig {
  maxBytes: number;
  driver: string;
  allowed: string[];
}

interface StoredObject {
  objectKey: string;
  url: string;
  mimeType: string;
  fileSize: number;
}

interface MediaObject {
  objectKey: string;
  url: string;
  size: number;
  uploadedAt: number;
  contentType: string | null;
}

interface MediaPage {
  items: MediaObject[];
  cursor: string | null;
  folders: string[];
}

/**
 * `GET /v1/admin/images/status` spreads `imageProviderStatus()` at the top level
 * rather than nesting it, so the provider fields sit alongside the cover data.
 */
interface ImagesStatus {
  provider: string;
  workersAi: boolean;
  gemini: boolean;
  houseModels: { male: string | null; female: string | null; couple: string | null };
  missingCovers: { id: string; slug: string; title: string; inputMode: string }[];
  missingCount: number;
}

function kb(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function MediaPage() {
  const config = useQuery<UploadConfig>('/v1/admin/upload/config');
  const images = useQuery<ImagesStatus>('/v1/admin/images/status');

  const [folder, setFolder] = useState('prompts');
  const [prefix, setPrefix] = useState('');
  const [pages, setPages] = useState<MediaObject[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<MediaObject | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const upload = useMutation();
  const action = useMutation();

  // The first page is a query keyed on the prefix; subsequent pages are appended
  // by the "load more" button below, which is why `pages` is separate state.
  const first = useQuery<MediaPage>(
    `/v1/admin/media${qs({ prefix: prefix || undefined, limit: 60 })}`,
    [prefix],
  );

  const usage = useQuery<{ promptCount: number; titles: string[] }>(
    confirming ? `/v1/admin/media/usage${qs({ key: confirming.objectKey })}` : null,
    [confirming?.objectKey],
  );

  const items = [...(first.data?.items ?? []), ...pages.flat()];
  const nextCursor = cursor ?? first.data?.cursor ?? null;
  const maxMb = config.data ? Math.floor(config.data.maxBytes / (1024 * 1024)) : 8;

  function refresh(message?: string) {
    setPages([]);
    setCursor(null);
    setSelected(new Set());
    setConfirming(null);
    if (message) setNotice(message);
    first.reload();
    images.reload();
  }

  async function doUpload(file: File) {
    const form = new FormData();
    form.set('file', file);
    if (folder) form.set('folder', folder);
    const stored = await upload.run(() => api.upload<StoredObject>('/v1/admin/upload', form));
    if (stored) refresh(`Uploaded ${stored.objectKey}.`);
  }

  async function loadMore() {
    if (!nextCursor) return;
    const page = await action.run(() =>
      api.get<MediaPage>(`/v1/admin/media${qs({ prefix: prefix || undefined, limit: 60, cursor: nextCursor })}`),
    );
    if (page) {
      setPages((previous) => [...previous, page.items]);
      setCursor(page.cursor);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard permission denied — the URL is still selectable in the field.
    }
  }

  async function deleteOne(object: MediaObject) {
    const ok = await action.run(() =>
      api.delete(`/v1/admin/media${qs({ key: object.objectKey })}`),
    );
    if (ok !== null) refresh(`Deleted ${object.objectKey}.`);
  }

  async function deleteSelected() {
    const keys = [...selected];
    if (!window.confirm(`Delete ${keys.length} file(s)? This cannot be undone.`)) return;

    const result = await action.run(() =>
      api.post<{ deleted: number; failed: { key: string }[] }>('/v1/admin/media/bulk-delete', {
        keys,
      }),
    );
    if (result) {
      refresh(
        `Deleted ${result.deleted} file(s)${result.failed.length ? `, ${result.failed.length} failed` : ''}.`,
      );
    }
  }

  async function generateHouseModel(kind: 'male' | 'female' | 'couple') {
    const result = await action.run(() =>
      api.post<{ url: string; engine: string }>(`/v1/admin/images/house-models/${kind}`, {}),
    );
    if (result) refresh(`Generated the ${kind} reference face with ${result.engine}.`);
  }

  const folders = first.data?.folders ?? [];

  return (
    <>
      <PageHeader
        title="Media"
        description="Everything in the R2 bucket. Uploads here are what prompt covers and article images point at."
        actions={
          <div className="flex items-center gap-2">
            {config.data && <Badge tone="neutral">Driver: {config.data.driver}</Badge>}
            <Button variant="outline" size="sm" onClick={() => refresh()}>
              Refresh
            </Button>
          </div>
        }
      />

      {(upload.error || action.error) && <Alert>{upload.error ?? action.error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Upload" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Folder" hint="Grouping prefix inside the bucket.">
              <Input value={folder} onChange={(event) => setFolder(event.target.value)} />
            </Field>

            <Field
              label="Image"
              hint={`${config.data?.allowed.join(', ') ?? 'JPEG, PNG, WebP, AVIF, GIF'} up to ${maxMb} MB. The API re-checks magic bytes, so a renamed file is rejected.`}
            >
              <Input
                type="file"
                accept="image/*"
                disabled={upload.pending}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void doUpload(file);
                  event.target.value = '';
                }}
              />
            </Field>
          </div>
          {upload.pending && (
            <p className="mt-3 text-sm text-[var(--text-muted)]">Uploading…</p>
          )}
        </Card>

        {/* Image operations. Both of these endpoints existed with no UI at all. */}
        <Card title="Image operations" description="Cover generation health.">
          {images.loading && !images.data ? (
            <Spinner label="Checking" />
          ) : (
            <div className="space-y-3">
              {images.data && (
                <div>
                  <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    Image provider
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone="brand">{images.data.provider}</Badge>
                    <Badge tone={images.data.workersAi ? 'success' : 'neutral'}>
                      workers-ai {images.data.workersAi ? 'ready' : 'off'}
                    </Badge>
                    <Badge tone={images.data.gemini ? 'success' : 'neutral'}>
                      gemini {images.data.gemini ? 'ready' : 'off'}
                    </Badge>
                  </div>
                </div>
              )}

              {typeof images.data?.missingCount === 'number' && (
                <div>
                  <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    Prompts without a cover
                  </p>
                  <p
                    className={cn(
                      'tabular mt-1 text-xl font-bold',
                      images.data.missingCount > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400',
                    )}
                  >
                    {formatNumber(images.data.missingCount)}
                  </p>
                  {images.data.missingCount > 0 && (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Generate covers from the Automation screen, or per prompt in the editor.
                    </p>
                  )}
                </div>
              )}

              <div>
                <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Reference faces
                </p>
                <p className="mt-1 mb-2 text-xs text-[var(--text-muted)]">
                  Synthetic house models used as the identity for photo-edit covers. Generate once;
                  re-running replaces it.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(['male', 'female', 'couple'] as const).map((kind) => {
                    const existing = images.data?.houseModels?.[kind];
                    return (
                      <Button
                        key={kind}
                        variant="outline"
                        size="sm"
                        loading={action.pending}
                        onClick={() => void generateHouseModel(kind)}
                      >
                        {existing ? `Replace ${kind}` : `Create ${kind}`}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card
        className="mt-4"
        title="Bucket"
        description={
          items.length > 0 ? `${formatNumber(items.length)} file(s) loaded.` : undefined
        }
        actions={
          folders.length > 0 ? (
            <Select
              value={prefix}
              onChange={(event) => {
                setPrefix(event.target.value);
                setPages([]);
                setCursor(null);
                setSelected(new Set());
              }}
              className="w-auto min-w-36"
            >
              <option value="">All folders</option>
              {folders.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      >
        {selected.size > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900 dark:bg-rose-950/40">
            <p className="text-sm font-semibold text-[var(--text-strong)]">
              {selected.size} selected
            </p>
            <Button variant="danger" size="sm" loading={action.pending} onClick={() => void deleteSelected()}>
              Delete {selected.size}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}

        {first.error && <Alert>{first.error}</Alert>}
        {first.loading && !first.data && <Spinner label="Listing files" />}

        {first.data && items.length === 0 && (
          <EmptyState>Nothing in the bucket{prefix ? ` under "${prefix}"` : ''} yet.</EmptyState>
        )}

        {items.length > 0 && (
          <>
            <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => {
                const isSelected = selected.has(item.objectKey);
                return (
                  <li
                    key={item.objectKey}
                    className={cn(
                      'group relative overflow-hidden rounded-xl border transition-colors',
                      isSelected
                        ? 'border-brand-500 ring-2 ring-brand-500/30'
                        : 'border-[var(--border-line)]',
                    )}
                  >
                    <div className="absolute left-2 top-2 z-10">
                      <Checkbox
                        label=""
                        aria-label={`Select ${item.objectKey}`}
                        checked={isSelected}
                        onChange={() =>
                          setSelected((previous) => {
                            const next = new Set(previous);
                            if (next.has(item.objectKey)) next.delete(item.objectKey);
                            else next.add(item.objectKey);
                            return next;
                          })
                        }
                      />
                    </div>

                    <img
                      src={item.url}
                      alt=""
                      loading="lazy"
                      className="aspect-4/3 w-full bg-[var(--surface-sunken)] object-cover"
                    />

                    <div className="p-2.5">
                      <p
                        className="truncate font-mono text-[0.625rem] text-[var(--text-muted)]"
                        title={item.objectKey}
                      >
                        {item.objectKey}
                      </p>
                      <p className="mt-0.5 text-[0.625rem] text-[var(--text-muted)]">
                        {kb(item.size)}
                        {item.contentType ? ` · ${item.contentType.replace('image/', '')}` : ''} ·{' '}
                        {formatDateTime(item.uploadedAt)}
                      </p>

                      <div className="mt-2 flex gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => void copy(item.url)}
                        >
                          {copied === item.url ? 'Copied' : 'Copy URL'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirming(item)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {nextCursor && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" loading={action.pending} onClick={() => void loadMore()}>
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {confirming && (
        <Modal title="Delete this file?" onClose={() => setConfirming(null)}>
          <img
            src={confirming.url}
            alt=""
            className="aspect-4/3 w-full rounded-lg bg-[var(--surface-sunken)] object-cover"
          />
          <p className="mt-3 break-all font-mono text-xs text-[var(--text-muted)]">
            {confirming.objectKey}
          </p>

          {usage.loading && <p className="mt-3 text-sm text-[var(--text-muted)]">Checking references…</p>}

          {usage.data && usage.data.promptCount > 0 ? (
            <div className="mt-3">
              <Alert tone="danger">
                Still used by {usage.data.promptCount} prompt(s)
                {usage.data.titles.length > 0 ? `: ${usage.data.titles.slice(0, 3).join(', ')}` : ''}.
                Deleting it will leave those pages with a broken image.
              </Alert>
            </div>
          ) : usage.data ? (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              Nothing references this file.
            </p>
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={action.pending} onClick={() => void deleteOne(confirming)}>
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
