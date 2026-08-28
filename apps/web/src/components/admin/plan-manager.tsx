'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiClientError, api } from '@/lib/client-api';
import { formatMoney } from '@/lib/utils';
import type { PlanView } from '@/services/plans';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox, Input, Select, Textarea } from '../ui/field';
import { EditIcon, PlusIcon } from '../ui/icon';
import { Modal } from '../ui/modal';
import { useToast } from '../ui/toast';
import { AdminTable, CellStack, type Column } from './admin-table';

interface FormState {
  code: string;
  name: string;
  description: string;
  /** Entered in rupees for usability; converted to paise on submit. */
  priceMajor: string;
  billingPeriod: 'none' | 'month' | 'year' | 'lifetime';
  intervalCount: number;
  trialDays: number;
  features: string;
  copiesPerDay: string;
  favorites: string;
  generatorPerDay: string;
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
}

const EMPTY: FormState = {
  code: '',
  name: '',
  description: '',
  priceMajor: '',
  billingPeriod: 'month',
  intervalCount: 1,
  trialDays: 0,
  features: '',
  copiesPerDay: '-1',
  favorites: '-1',
  generatorPerDay: '-1',
  isActive: true,
  isPopular: false,
  sortOrder: 0,
};

export function PlanManager({ initial }: { initial: PlanView[] }) {
  const router = useRouter();
  const toast = useToast();

  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function openEdit(plan: PlanView) {
    setErrors({});
    setEditing({
      code: plan.code,
      name: plan.name,
      description: plan.description ?? '',
      priceMajor: String(plan.priceMinor / 100),
      billingPeriod: plan.billingPeriod,
      intervalCount: plan.intervalCount,
      trialDays: plan.trialDays,
      features: plan.features.join('\n'),
      copiesPerDay: String(plan.limits.copiesPerDay ?? -1),
      favorites: String(plan.limits.favorites ?? -1),
      generatorPerDay: String(plan.limits.generatorPerDay ?? -1),
      isActive: plan.isActive,
      isPopular: plan.isPopular,
      sortOrder: plan.sortOrder,
    });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setErrors({});

    const priceMinor = Math.round(Number(editing.priceMajor || '0') * 100);

    try {
      await api.post('/api/admin/plans', {
        code: editing.code,
        name: editing.name,
        description: editing.description || undefined,
        priceMinor,
        currency: 'INR',
        billingPeriod: editing.billingPeriod,
        intervalCount: editing.intervalCount,
        trialDays: editing.trialDays,
        features: editing.features
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        limits: {
          copiesPerDay: Number(editing.copiesPerDay),
          favorites: Number(editing.favorites),
          generatorPerDay: Number(editing.generatorPerDay),
        },
        isActive: editing.isActive,
        isPopular: editing.isPopular,
        sortOrder: editing.sortOrder,
      });
      toast.success('Plan saved', `${editing.name} — ${formatMoney(priceMinor)}`);
      setEditing(null);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        const details = error.details as { issues?: { path: string; message: string }[] } | undefined;
        const mapped: Record<string, string> = {};
        for (const issue of details?.issues ?? []) if (issue.path) mapped[issue.path] = issue.message;
        setErrors(mapped);
        toast.error('Could not save plan', error.message);
      } else {
        toast.error('Could not save plan', 'Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(plan: PlanView) {
    try {
      await api.patch('/api/admin/plans', { id: plan.id, isActive: !plan.isActive });
      toast.success(plan.isActive ? 'Plan hidden' : 'Plan activated');
      router.refresh();
    } catch (error) {
      toast.error(
        'Could not update plan',
        error instanceof ApiClientError ? error.message : 'Please try again.',
      );
    }
  }

  const columns: Column<PlanView>[] = [
    {
      key: 'plan',
      header: 'Plan',
      render: (row) => (
        <CellStack
          primary={
            <span className="flex items-center gap-2">
              {row.name}
              {row.isPopular && <Badge tone="brand">Popular</Badge>}
            </span>
          }
          secondary={`code: ${row.code}`}
        />
      ),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      render: (row) => (
        <CellStack
          primary={
            <span className="tabular-nums">
              {row.priceMinor === 0 ? 'Free' : formatMoney(row.priceMinor, row.currency)}
            </span>
          }
          secondary={row.billingPeriod === 'none' ? '' : `per ${row.billingPeriod}`}
        />
      ),
    },
    {
      key: 'limits',
      header: 'Limits (copies / saves / generator)',
      hideOnMobile: true,
      render: (row) => (
        <span className="tabular-nums text-body">
          {formatLimit(row.limits.copiesPerDay)} / {formatLimit(row.limits.favorites)} /{' '}
          {formatLimit(row.limits.generatorPerDay)}
        </span>
      ),
    },
    {
      key: 'features',
      header: 'Features',
      align: 'center',
      hideOnMobile: true,
      render: (row) => <span className="text-body">{row.features.length}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={row.isActive ? 'success' : 'neutral'}>
          {row.isActive ? 'Active' : 'Hidden'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => void toggleActive(row)}
            disabled={row.code === 'free'}
            className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-600 hover:bg-brand-50 disabled:opacity-40 dark:text-brand-300 dark:hover:bg-brand-950/50"
          >
            {row.isActive ? 'Hide' : 'Activate'}
          </button>
          <button
            type="button"
            onClick={() => openEdit(row)}
            aria-label={`Edit ${row.name}`}
            className="grid size-8 place-items-center rounded-lg text-body hover:bg-[var(--surface-sunken)]"
          >
            <EditIcon size={15} />
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
            setEditing({ ...EMPTY, sortOrder: initial.length });
          }}
          leadingIcon={<PlusIcon size={15} />}
        >
          New plan
        </Button>
      </div>

      <AdminTable
        caption="Membership plans"
        columns={columns}
        rows={initial}
        rowKey={(row) => row.id}
      />

      <Modal
        open={editing !== null}
        onClose={() => !saving && setEditing(null)}
        title={editing?.code ? `Edit plan: ${editing.name || editing.code}` : 'New plan'}
        description="Prices are entered in rupees and stored in paise."
        size="md"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" fullWidth onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button fullWidth loading={saving} onClick={save}>
              Save plan
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Plan code"
                value={editing.code}
                onChange={(event) =>
                  setEditing({ ...editing, code: event.target.value.toLowerCase() })
                }
                error={errors.code}
                hint="Lowercase, no spaces. Used by the checkout API."
                required
              />
              <Input
                label="Display name"
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                error={errors.name}
                required
              />
            </div>

            <Textarea
              label="Description"
              value={editing.description}
              onChange={(event) => setEditing({ ...editing, description: event.target.value })}
              rows={2}
              maxLength={300}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                type="number"
                label="Price (₹)"
                value={editing.priceMajor}
                onChange={(event) => setEditing({ ...editing, priceMajor: event.target.value })}
                error={errors.priceMinor}
                min={0}
                step="1"
                required
              />
              <Select
                label="Billing period"
                value={editing.billingPeriod}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    billingPeriod: event.target.value as FormState['billingPeriod'],
                  })
                }
                options={[
                  { value: 'none', label: 'None (free)' },
                  { value: 'month', label: 'Monthly' },
                  { value: 'year', label: 'Yearly' },
                  { value: 'lifetime', label: 'Lifetime (one-time)' },
                ]}
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

            <Textarea
              label="Marketing features"
              value={editing.features}
              onChange={(event) => setEditing({ ...editing, features: event.target.value })}
              rows={6}
              hint="One bullet point per line."
            />

            <fieldset className="grid gap-4 sm:grid-cols-3">
              <legend className="mb-1 text-sm font-bold">Plan limits (−1 = unlimited)</legend>
              <Input
                type="number"
                label="Copies per day"
                value={editing.copiesPerDay}
                onChange={(event) => setEditing({ ...editing, copiesPerDay: event.target.value })}
                min={-1}
              />
              <Input
                type="number"
                label="Saved favourites"
                value={editing.favorites}
                onChange={(event) => setEditing({ ...editing, favorites: event.target.value })}
                min={-1}
              />
              <Input
                type="number"
                label="Generator runs per day"
                value={editing.generatorPerDay}
                onChange={(event) => setEditing({ ...editing, generatorPerDay: event.target.value })}
                min={-1}
              />
            </fieldset>

            <div className="grid gap-2.5">
              <Checkbox
                label="Active"
                description="Inactive plans are hidden from the pricing page and cannot be purchased."
                checked={editing.isActive}
                onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })}
              />
              <Checkbox
                label="Highlight as most popular"
                checked={editing.isPopular}
                onChange={(event) => setEditing({ ...editing, isPopular: event.target.checked })}
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function formatLimit(value: number | undefined): string {
  if (value === undefined) return '—';
  return value < 0 ? '∞' : String(value);
}
