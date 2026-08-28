'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiClientError, api } from '@/lib/client-api';
import { slugify } from '@/lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox, Input, Select, Textarea } from '../ui/field';
import { EditIcon, PlusIcon, TrashIcon } from '../ui/icon';
import { ConfirmDialog, Modal } from '../ui/modal';
import { useToast } from '../ui/toast';
import { AdminTable, CellStack, type Column } from './admin-table';

export interface AdminCategoryRow {
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
  updatedAt: number;
}

const ACCENTS = [
  'indigo',
  'violet',
  'marigold',
  'rose',
  'teal',
  'sky',
  'amber',
  'emerald',
  'slate',
] as const;

interface FormState {
  id?: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  accent: string;
  parentId: string;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  seoTitle: string;
  seoDescription: string;
}

const EMPTY: FormState = {
  name: '',
  slug: '',
  description: '',
  icon: '',
  accent: 'indigo',
  parentId: '',
  sortOrder: 0,
  isActive: true,
  isFeatured: false,
  seoTitle: '',
  seoDescription: '',
};

export function CategoryManager({ initial }: { initial: AdminCategoryRow[] }) {
  const router = useRouter();
  const toast = useToast();

  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<AdminCategoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openNew() {
    setErrors({});
    setEditing({ ...EMPTY, sortOrder: initial.length });
  }

  function openEdit(row: AdminCategoryRow) {
    setErrors({});
    setEditing({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description ?? '',
      icon: row.icon ?? '',
      accent: row.accent,
      parentId: row.parentId ?? '',
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      isFeatured: row.isFeatured,
      seoTitle: '',
      seoDescription: '',
    });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setErrors({});

    const payload = {
      name: editing.name,
      slug: editing.slug || slugify(editing.name),
      description: editing.description || undefined,
      icon: editing.icon || undefined,
      accent: editing.accent,
      parentId: editing.parentId || undefined,
      sortOrder: editing.sortOrder,
      isActive: editing.isActive,
      isFeatured: editing.isFeatured,
      seoTitle: editing.seoTitle || undefined,
      seoDescription: editing.seoDescription || undefined,
    };

    try {
      if (editing.id) {
        await api.patch(`/api/admin/categories/${editing.id}`, payload);
        toast.success('Category updated');
      } else {
        await api.post('/api/admin/categories', payload);
        toast.success('Category created');
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
      await api.delete(`/api/admin/categories/${pendingDelete.id}`);
      toast.success('Category deleted');
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

  const columns: Column<AdminCategoryRow>[] = [
    {
      key: 'name',
      header: 'Category',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="text-lg">
            {row.icon ?? '•'}
          </span>
          <CellStack primary={row.name} secondary={`/category/${row.slug}`} />
        </div>
      ),
    },
    {
      key: 'prompts',
      header: 'Prompts',
      align: 'right',
      render: (row) => <span className="tabular-nums font-semibold">{row.promptCount}</span>,
    },
    {
      key: 'flags',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={row.isActive ? 'success' : 'neutral'}>
            {row.isActive ? 'Active' : 'Hidden'}
          </Badge>
          {row.isFeatured && <Badge tone="brand">Featured</Badge>}
        </div>
      ),
    },
    {
      key: 'order',
      header: 'Order',
      align: 'center',
      hideOnMobile: true,
      render: (row) => <span className="tabular-nums text-body">{row.sortOrder}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={() => openEdit(row)}
            aria-label={`Edit ${row.name}`}
            className="grid size-8 place-items-center rounded-lg text-body hover:bg-[var(--surface-sunken)]"
          >
            <EditIcon size={15} />
          </button>
          <button
            type="button"
            onClick={() => setPendingDelete(row)}
            aria-label={`Delete ${row.name}`}
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
        <Button size="sm" onClick={openNew} leadingIcon={<PlusIcon size={15} />}>
          New category
        </Button>
      </div>

      <AdminTable
        caption="Prompt categories"
        columns={columns}
        rows={initial}
        rowKey={(row) => row.id}
      />

      <Modal
        open={editing !== null}
        onClose={() => !saving && setEditing(null)}
        title={editing?.id ? `Edit ${editing.name}` : 'New category'}
        size="md"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" fullWidth onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button fullWidth loading={saving} onClick={save}>
              {editing?.id ? 'Save changes' : 'Create category'}
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Name"
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                onBlur={() => {
                  if (!editing.slug && editing.name) {
                    setEditing({ ...editing, slug: slugify(editing.name) });
                  }
                }}
                error={errors.name}
                required
              />
              <Input
                label="Slug"
                value={editing.slug}
                onChange={(event) => setEditing({ ...editing, slug: slugify(event.target.value) })}
                error={errors.slug}
                hint={`/category/${editing.slug || 'slug'}`}
              />
            </div>

            <Textarea
              label="Description"
              value={editing.description}
              onChange={(event) => setEditing({ ...editing, description: event.target.value })}
              rows={3}
              maxLength={400}
              hint="Shown on the category page and used as the default meta description."
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Icon"
                value={editing.icon}
                onChange={(event) => setEditing({ ...editing, icon: event.target.value })}
                placeholder="🥻"
                hint="A single emoji works well."
              />
              <Select
                label="Accent colour"
                value={editing.accent}
                onChange={(event) => setEditing({ ...editing, accent: event.target.value })}
                options={ACCENTS.map((accent) => ({ value: accent, label: accent }))}
              />
              <Input
                type="number"
                label="Sort order"
                value={editing.sortOrder}
                onChange={(event) =>
                  setEditing({ ...editing, sortOrder: Number(event.target.value) })
                }
                min={0}
              />
            </div>

            <Select
              label="Parent category"
              value={editing.parentId}
              onChange={(event) => setEditing({ ...editing, parentId: event.target.value })}
              options={initial
                .filter((row) => row.id !== editing.id && !row.parentId)
                .map((row) => ({ value: row.id, label: row.name }))}
              placeholder="None — this is a top-level category"
            />

            <div className="grid gap-2.5">
              <Checkbox
                label="Active"
                description="Hidden categories do not appear on the public site."
                checked={editing.isActive}
                onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })}
              />
              <Checkbox
                label="Featured"
                description="Pinned to the top of the homepage category grid."
                checked={editing.isFeatured}
                onChange={(event) => setEditing({ ...editing, isFeatured: event.target.checked })}
              />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={remove}
        loading={deleting}
        title="Delete this category?"
        message={
          pendingDelete
            ? pendingDelete.promptCount > 0
              ? `“${pendingDelete.name}” still has ${pendingDelete.promptCount} prompt(s). Move them to another category first — the server will refuse this deletion.`
              : `“${pendingDelete.name}” will be removed permanently.`
            : ''
        }
        confirmLabel="Delete category"
      />
    </>
  );
}
