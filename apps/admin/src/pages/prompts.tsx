import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

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
  formatDateTime,
  formatNumber,
} from '@/components/ui';
import { AI_MODELS } from '@pd/shared';
import { api, qs } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/use-api';

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

export function PromptsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [model, setModel] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);

  const categories = useQuery<{ items: CategoryRow[] }>('/v1/admin/categories');
  const prompts = useQuery<PromptListResponse>(
    `/v1/admin/prompts${qs({ q: search, status, model, category, page, pageSize: 25 })}`,
  );
  const { run, pending, error } = useMutation();

  const totalPages = prompts.data
    ? Math.max(1, Math.ceil(prompts.data.total / prompts.data.pageSize))
    : 1;

  async function togglePublished(prompt: AdminPromptRow) {
    const ok = await run(() =>
      api.patch(`/v1/admin/prompts/${encodeURIComponent(prompt.id)}/publish`, {
        isPublished: !prompt.isPublished,
      }),
    );
    if (ok !== null) prompts.reload();
  }

  async function remove(prompt: AdminPromptRow) {
    if (!window.confirm(`Delete "${prompt.title}"? This cannot be undone.`)) return;
    const ok = await run(() => api.delete(`/v1/admin/prompts/${encodeURIComponent(prompt.id)}`));
    if (ok !== null) prompts.reload();
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

      <Card className="mb-4">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            prompts.reload();
          }}
        >
          <Input
            placeholder="Search title or body…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="lg:col-span-2"
          />
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </Select>
          <Select
            value={model}
            onChange={(event) => {
              setModel(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All models</option>
            {AI_MODELS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </Select>
          <Select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
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

      <Card>
        {prompts.error && <Alert>{prompts.error}</Alert>}
        {prompts.loading && !prompts.data && <Spinner label="Loading prompts" />}

        {prompts.data && prompts.data.items.length === 0 && (
          <EmptyState>No prompts match these filters.</EmptyState>
        )}

        {prompts.data && prompts.data.items.length > 0 && (
          <Table head={['Prompt', 'Model', 'Category', 'Stats', 'Updated', '']}>
            {prompts.data.items.map((prompt) => (
              <Row key={prompt.id}>
                <Cell>
                  <Link
                    to={`/prompts/${prompt.id}`}
                    className="font-semibold text-ink hover:text-brand-600"
                  >
                    {prompt.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge tone={prompt.isPublished ? 'success' : 'warning'}>
                      {prompt.isPublished ? 'Published' : 'Draft'}
                    </Badge>
                    {prompt.isPremium && <Badge tone="brand">Premium</Badge>}
                    {prompt.isTrending && <Badge>Trending</Badge>}
                    {prompt.isFeatured && <Badge>Featured</Badge>}
                  </div>
                </Cell>
                <Cell>{prompt.aiModel}</Cell>
                <Cell>{prompt.categoryName}</Cell>
                <Cell className="whitespace-nowrap text-xs">
                  {formatNumber(prompt.viewCount)} views
                  <br />
                  {formatNumber(prompt.copyCount)} copies
                </Cell>
                <Cell className="whitespace-nowrap text-xs">
                  {formatDateTime(prompt.updatedAt)}
                </Cell>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => void remove(prompt)}
                    >
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
    </>
  );
}
