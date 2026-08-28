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
  Spinner,
  Table,
  Textarea,
  formatDate,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/use-api';

interface ArticleRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  categoryName: string | null;
  authorName: string | null;
  isPublished: boolean;
  publishedAt: number | null;
  readingMinutes: number;
  viewCount: number;
  updatedAt: number;
}

interface ArticleDetail extends ArticleRow {
  content: string;
  seoTitle: string | null;
  seoDescription: string | null;
  keywords: string | null;
  categoryId: string | null;
  featuredImageUrl: string | null;
}

interface FormState {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featuredImageUrl: string;
  seoTitle: string;
  seoDescription: string;
  keywords: string;
  isPublished: boolean;
}

const BLANK: FormState = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  featuredImageUrl: '',
  seoTitle: '',
  seoDescription: '',
  keywords: '',
  isPublished: false,
};

export function ArticlesPage() {
  const articles = useQuery<{ items: ArticleRow[] }>('/v1/admin/articles');
  const { run, pending, error, fieldErrors } = useMutation();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(BLANK);

  function openCreate() {
    setForm(BLANK);
    setEditingId(null);
    setOpen(true);
  }

  async function openEdit(row: ArticleRow) {
    setEditingId(row.id);
    setOpen(true);
    const detail = await run(() => api.get<ArticleDetail>(`/v1/admin/articles/${row.id}`));
    if (detail) {
      setForm({
        title: detail.title,
        slug: detail.slug,
        excerpt: detail.excerpt ?? '',
        content: detail.content,
        featuredImageUrl: detail.featuredImageUrl ?? '',
        seoTitle: detail.seoTitle ?? '',
        seoDescription: detail.seoDescription ?? '',
        keywords: detail.keywords ?? '',
        isPublished: detail.isPublished,
      });
    }
  }

  async function save() {
    const payload = {
      title: form.title,
      slug: form.slug || undefined,
      excerpt: form.excerpt || undefined,
      content: form.content,
      featuredImageUrl: form.featuredImageUrl || undefined,
      seoTitle: form.seoTitle || undefined,
      seoDescription: form.seoDescription || undefined,
      keywords: form.keywords || undefined,
      isPublished: form.isPublished,
    };
    const saved = await run(() =>
      editingId
        ? api.put(`/v1/admin/articles/${editingId}`, payload)
        : api.post('/v1/admin/articles', payload),
    );
    if (saved !== null) {
      setOpen(false);
      articles.reload();
    }
  }

  async function remove(row: ArticleRow) {
    if (!window.confirm(`Delete "${row.title}"?`)) return;
    const ok = await run(() => api.delete(`/v1/admin/articles/${row.id}`));
    if (ok !== null) articles.reload();
  }

  return (
    <>
      <PageHeader
        title="Articles"
        description="Long-form guides. Published articles appear on the blog and in the sitemap."
        actions={<Button onClick={openCreate}>New article</Button>}
      />

      {error && !open && <Alert>{error}</Alert>}

      <Card>
        {articles.error && <Alert>{articles.error}</Alert>}
        {articles.loading && !articles.data && <Spinner label="Loading articles" />}
        {articles.data?.items.length === 0 && <EmptyState>No articles yet.</EmptyState>}

        {articles.data && articles.data.items.length > 0 && (
          <Table head={['Article', 'Author', 'Published', 'Views', '']}>
            {articles.data.items.map((row) => (
              <Row key={row.id}>
                <Cell>
                  <span className="font-semibold text-ink">{row.title}</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge tone={row.isPublished ? 'success' : 'warning'}>
                      {row.isPublished ? 'Published' : 'Draft'}
                    </Badge>
                    <Badge>{row.readingMinutes} min read</Badge>
                  </div>
                </Cell>
                <Cell>{row.authorName ?? '—'}</Cell>
                <Cell className="whitespace-nowrap text-xs">{formatDate(row.publishedAt)}</Cell>
                <Cell>{row.viewCount}</Cell>
                <Cell>
                  <div className="flex justify-end gap-1">
                    <Button variant="outline" size="sm" onClick={() => void openEdit(row)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => void remove(row)}
                    >
                      Delete
                    </Button>
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      {open && (
        <Modal title={editingId ? 'Edit article' : 'New article'} onClose={() => setOpen(false)} wide>
          <div className="space-y-4">
            {error && <Alert>{error}</Alert>}

            <Field label="Title" error={fieldErrors.title}>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>

            <Field label="Slug" hint="Leave blank to generate from the title.">
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </Field>

            <Field label="Excerpt" error={fieldErrors.excerpt}>
              <Textarea
                rows={2}
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
              />
            </Field>

            <Field
              label="Content"
              hint="Markdown-ish; rendered through a sanitising renderer."
              error={fieldErrors.content}
            >
              <Textarea
                rows={14}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </Field>

            <Field label="Featured image URL" error={fieldErrors.featuredImageUrl}>
              <Input
                value={form.featuredImageUrl}
                onChange={(e) => setForm({ ...form, featuredImageUrl: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SEO title" error={fieldErrors.seoTitle}>
                <Input
                  value={form.seoTitle}
                  onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}
                />
              </Field>
              <Field label="Keywords" error={fieldErrors.keywords}>
                <Input
                  value={form.keywords}
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Meta description" error={fieldErrors.seoDescription}>
              <Textarea
                rows={2}
                value={form.seoDescription}
                onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
              />
            </Field>

            <Checkbox
              label="Published"
              checked={form.isPublished}
              onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
            />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
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
