'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiClientError, api } from '@/lib/client-api';
import { formatDate, relativeTime } from '@/lib/dates';
import { readingMinutes, slugify } from '@/lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox, Input, Select, Textarea } from '../ui/field';
import { EditIcon, EyeIcon, PlusIcon, TrashIcon } from '../ui/icon';
import { ConfirmDialog, Modal } from '../ui/modal';
import { useToast } from '../ui/toast';
import { AdminEmpty, AdminTable, CellStack, type Column } from './admin-table';

export interface AdminArticleRow {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
  viewCount: number;
  publishedAt: number | null;
  updatedAt: number;
  categoryName: string | null;
}

interface FormState {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featuredImageUrl: string;
  categoryId: string;
  seoTitle: string;
  seoDescription: string;
  keywords: string;
  isPublished: boolean;
}

const EMPTY: FormState = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  featuredImageUrl: '',
  categoryId: '',
  seoTitle: '',
  seoDescription: '',
  keywords: '',
  isPublished: false,
};

export function ArticleManager({
  initial,
  categories,
}: {
  initial: AdminArticleRow[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<AdminArticleRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  /** Loads the full body for editing (the list query omits it). */
  async function openEdit(row: AdminArticleRow) {
    setLoadingId(row.id);
    try {
      const data = await api.get<{
        article: {
          id: string;
          title: string;
          slug: string;
          excerpt: string | null;
          content: string;
          featuredImageUrl: string | null;
          categoryId: string | null;
          seoTitle: string | null;
          seoDescription: string | null;
          keywords: string | null;
          isPublished: boolean;
        };
      }>(`/api/admin/articles/${row.id}`);

      setErrors({});
      setEditing({
        id: data.article.id,
        title: data.article.title,
        slug: data.article.slug,
        excerpt: data.article.excerpt ?? '',
        content: data.article.content,
        featuredImageUrl: data.article.featuredImageUrl ?? '',
        categoryId: data.article.categoryId ?? '',
        seoTitle: data.article.seoTitle ?? '',
        seoDescription: data.article.seoDescription ?? '',
        keywords: data.article.keywords ?? '',
        isPublished: data.article.isPublished,
      });
    } catch (error) {
      toast.error(
        'Could not load the article',
        error instanceof ApiClientError ? error.message : 'Please try again.',
      );
    } finally {
      setLoadingId(null);
    }
  }

  async function save(publish?: boolean) {
    if (!editing) return;
    setSaving(true);
    setErrors({});

    const payload = {
      title: editing.title,
      slug: editing.slug || slugify(editing.title),
      excerpt: editing.excerpt || undefined,
      content: editing.content,
      featuredImageUrl: editing.featuredImageUrl || undefined,
      categoryId: editing.categoryId || undefined,
      seoTitle: editing.seoTitle || undefined,
      seoDescription: editing.seoDescription || undefined,
      keywords: editing.keywords || undefined,
      isPublished: publish ?? editing.isPublished,
    };

    try {
      if (editing.id) {
        await api.patch('/api/admin/articles', { ...payload, id: editing.id });
        toast.success('Article saved');
      } else {
        await api.post('/api/admin/articles', payload);
        toast.success('Article created');
      }
      setEditing(null);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        const details = error.details as { issues?: { path: string; message: string }[] } | undefined;
        const mapped: Record<string, string> = {};
        for (const issue of details?.issues ?? []) if (issue.path) mapped[issue.path] = issue.message;
        setErrors(mapped);
        toast.error('Could not save', error.message);
      } else {
        toast.error('Could not save', 'Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/articles?id=${encodeURIComponent(pendingDelete.id)}`);
      toast.success('Article deleted');
      setPendingDelete(null);
      router.refresh();
    } catch (error) {
      toast.error(
        'Could not delete',
        error instanceof ApiClientError ? error.message : 'Please try again.',
      );
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<AdminArticleRow>[] = [
    {
      key: 'title',
      header: 'Article',
      render: (row) => <CellStack primary={row.title} secondary={`/blog/${row.slug}`} />,
    },
    {
      key: 'category',
      header: 'Category',
      hideOnMobile: true,
      render: (row) => <span className="text-body">{row.categoryName ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={row.isPublished ? 'success' : 'neutral'}>
          {row.isPublished ? 'Published' : 'Draft'}
        </Badge>
      ),
    },
    {
      key: 'views',
      header: 'Views',
      align: 'right',
      hideOnMobile: true,
      render: (row) => <span className="tabular-nums text-body">{row.viewCount}</span>,
    },
    {
      key: 'dates',
      header: 'Updated',
      hideOnMobile: true,
      render: (row) => (
        <CellStack
          primary={<span className="text-xs font-normal">{relativeTime(row.updatedAt)}</span>}
          secondary={row.publishedAt ? `Published ${formatDate(row.publishedAt)}` : 'Not published'}
        />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-0.5">
          {row.isPublished && (
            <Link
              href={`/blog/${row.slug}`}
              target="_blank"
              aria-label={`View ${row.title}`}
              className="grid size-8 place-items-center rounded-lg text-body hover:bg-[var(--surface-sunken)]"
            >
              <EyeIcon size={15} />
            </Link>
          )}
          <button
            type="button"
            onClick={() => void openEdit(row)}
            disabled={loadingId === row.id}
            aria-label={`Edit ${row.title}`}
            className="grid size-8 place-items-center rounded-lg text-body hover:bg-[var(--surface-sunken)] disabled:opacity-50"
          >
            <EditIcon size={15} />
          </button>
          <button
            type="button"
            onClick={() => setPendingDelete(row)}
            aria-label={`Delete ${row.title}`}
            className="grid size-8 place-items-center rounded-lg text-body hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
          >
            <TrashIcon size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          size="sm"
          onClick={() => {
            setErrors({});
            setEditing({ ...EMPTY });
          }}
          leadingIcon={<PlusIcon size={15} />}
        >
          New article
        </Button>
      </div>

      <AdminTable
        caption="Articles and guides"
        columns={columns}
        rows={initial}
        rowKey={(row) => row.id}
        empty={
          <AdminEmpty
            title="No articles yet"
            description="Guides give the library editorial depth and bring in search traffic on their own."
          />
        }
      />

      <Modal
        open={editing !== null}
        onClose={() => !saving && setEditing(null)}
        title={editing?.id ? 'Edit article' : 'New article'}
        size="lg"
        footer={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={() => void save()} className="ml-auto">
              Save
            </Button>
            {editing && !editing.isPublished && (
              <Button variant="outline" loading={saving} onClick={() => void save(true)}>
                Save and publish
              </Button>
            )}
          </div>
        }
      >
        {editing && (
          <div className="grid gap-4">
            <Input
              label="Title"
              value={editing.title}
              onChange={(event) => setEditing({ ...editing, title: event.target.value })}
              onBlur={() => {
                if (!editing.slug && editing.title) {
                  setEditing({ ...editing, slug: slugify(editing.title) });
                }
              }}
              error={errors.title}
              required
            />

            <Input
              label="Slug"
              value={editing.slug}
              onChange={(event) => setEditing({ ...editing, slug: slugify(event.target.value) })}
              hint={`/blog/${editing.slug || 'slug'}`}
            />

            <Select
              label="Category"
              value={editing.categoryId}
              onChange={(event) => setEditing({ ...editing, categoryId: event.target.value })}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="No category"
            />

            <Textarea
              label="Excerpt"
              value={editing.excerpt}
              onChange={(event) => setEditing({ ...editing, excerpt: event.target.value })}
              rows={2}
              maxLength={400}
              hint="Shown on cards and used as the fallback meta description."
            />

            <Textarea
              label="Content"
              value={editing.content}
              onChange={(event) => setEditing({ ...editing, content: event.target.value })}
              error={errors.content}
              rows={16}
              required
              className="font-mono text-[0.8125rem]"
              hint={`Markdown-style: ## headings, - bullets, **bold**. About ${readingMinutes(editing.content)} min read.`}
            />

            <Input
              label="Featured image URL"
              value={editing.featuredImageUrl}
              onChange={(event) => setEditing({ ...editing, featuredImageUrl: event.target.value })}
              placeholder="https://…"
            />

            <Input
              label="SEO title"
              value={editing.seoTitle}
              onChange={(event) => setEditing({ ...editing, seoTitle: event.target.value })}
              maxLength={200}
            />

            <Textarea
              label="Meta description"
              value={editing.seoDescription}
              onChange={(event) => setEditing({ ...editing, seoDescription: event.target.value })}
              rows={2}
              maxLength={320}
              hint={`${editing.seoDescription.length}/320`}
            />

            <Input
              label="Keywords"
              value={editing.keywords}
              onChange={(event) => setEditing({ ...editing, keywords: event.target.value })}
              hint="Comma-separated."
            />

            <Checkbox
              label="Published"
              description="Published articles appear in /blog and in the sitemap."
              checked={editing.isPublished}
              onChange={(event) => setEditing({ ...editing, isPublished: event.target.checked })}
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={remove}
        loading={deleting}
        title="Delete this article?"
        message={pendingDelete ? `“${pendingDelete.title}” will be removed permanently.` : ''}
        confirmLabel="Delete article"
      />
    </>
  );
}
