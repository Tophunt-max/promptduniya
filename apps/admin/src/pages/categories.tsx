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
  formatNumber,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/use-api';

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  accent: string;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  promptCount: number;
}

interface FormState {
  name: string;
  slug: string;
  description: string;
  icon: string;
  accent: string;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
}

const BLANK: FormState = {
  name: '',
  slug: '',
  description: '',
  icon: '',
  accent: 'indigo',
  sortOrder: 0,
  isActive: true,
  isFeatured: false,
};

export function CategoriesPage() {
  const categories = useQuery<{ items: CategoryRow[] }>('/v1/admin/categories');
  const { run, pending, error, fieldErrors } = useMutation();

  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(BLANK);

  function openCreate() {
    setForm(BLANK);
    setEditing(null);
    setCreating(true);
  }

  function openEdit(category: CategoryRow) {
    setForm({
      name: category.name,
      slug: category.slug,
      description: category.description ?? '',
      icon: category.icon ?? '',
      accent: category.accent,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      isFeatured: category.isFeatured,
    });
    setCreating(false);
    setEditing(category);
  }

  function close() {
    setCreating(false);
    setEditing(null);
  }

  async function save() {
    const payload = {
      name: form.name,
      slug: form.slug || undefined,
      description: form.description || undefined,
      icon: form.icon || undefined,
      accent: form.accent || undefined,
      sortOrder: form.sortOrder,
      isActive: form.isActive,
      isFeatured: form.isFeatured,
    };
    const saved = await run(() =>
      editing
        ? api.put(`/v1/admin/categories/${encodeURIComponent(editing.id)}`, payload)
        : api.post('/v1/admin/categories', payload),
    );
    if (saved !== null) {
      close();
      categories.reload();
    }
  }

  async function remove(category: CategoryRow) {
    if (!window.confirm(`Delete "${category.name}"?`)) return;
    const ok = await run(() =>
      api.delete(`/v1/admin/categories/${encodeURIComponent(category.id)}`),
    );
    if (ok !== null) categories.reload();
  }

  const open = creating || editing !== null;

  return (
    <>
      <PageHeader
        title="Categories"
        description="Categories drive the browse pages and the prompt taxonomy."
        actions={<Button onClick={openCreate}>New category</Button>}
      />

      {error && !open && <Alert>{error}</Alert>}

      <Card>
        {categories.error && <Alert>{categories.error}</Alert>}
        {categories.loading && !categories.data && <Spinner label="Loading categories" />}

        {categories.data?.items.length === 0 && (
          <EmptyState>No categories yet. Create the first one.</EmptyState>
        )}

        {categories.data && categories.data.items.length > 0 && (
          <Table head={['Category', 'Slug', 'Prompts', 'Order', '']}>
            {categories.data.items.map((category) => (
              <Row key={category.id}>
                <Cell>
                  <span className="font-semibold text-ink">{category.name}</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {!category.isActive && <Badge tone="warning">Hidden</Badge>}
                    {category.isFeatured && <Badge tone="brand">Featured</Badge>}
                    {category.parentId && <Badge>Sub-category</Badge>}
                  </div>
                </Cell>
                <Cell className="font-mono text-xs">{category.slug}</Cell>
                <Cell>{formatNumber(category.promptCount)}</Cell>
                <Cell>{category.sortOrder}</Cell>
                <Cell>
                  <div className="flex justify-end gap-1">
                    <Button variant="outline" size="sm" onClick={() => openEdit(category)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => void remove(category)}
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
        <Modal title={editing ? `Edit ${editing.name}` : 'New category'} onClose={close}>
          <div className="space-y-4">
            {error && <Alert>{error}</Alert>}

            <Field label="Name" error={fieldErrors.name}>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <Field
              label="Slug"
              hint="Leave blank to generate from the name."
              error={fieldErrors.slug}
            >
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </Field>

            <Field label="Description" error={fieldErrors.description}>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Icon" error={fieldErrors.icon}>
                <Input
                  value={form.icon}
                  onChange={(e) => setForm({ ...form, icon: e.target.value })}
                />
              </Field>
              <Field label="Accent" error={fieldErrors.accent}>
                <Input
                  value={form.accent}
                  onChange={(e) => setForm({ ...form, accent: e.target.value })}
                />
              </Field>
              <Field label="Sort order">
                <Input
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                />
              </Field>
            </div>

            <div className="flex gap-4">
              <Checkbox
                label="Active"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <Checkbox
                label="Featured"
                checked={form.isFeatured}
                onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={close}>
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
