'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiClientError, api } from '@/lib/client-api';
import { formatDate, nowSec } from '@/lib/dates';
import { formatMoney } from '@/lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox, Input, Select, Textarea } from '../ui/field';
import { EditIcon, PlusIcon, TrashIcon } from '../ui/icon';
import { ConfirmDialog, Modal } from '../ui/modal';
import { useToast } from '../ui/toast';
import { AdminEmpty, AdminTable, CellStack, type Column } from './admin-table';

export interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  percentage: number | null;
  amountMinor: number | null;
  startDate: number | null;
  endDate: number | null;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  minAmountMinor: number;
  isActive: boolean;
  createdAt: number;
  applicablePlans: string[];
}

interface FormState {
  id?: string;
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  percentage: string;
  amountMajor: string;
  startDate: string;
  endDate: string;
  usageLimit: string;
  perUserLimit: string;
  applicablePlans: string[];
  minAmountMajor: string;
  isActive: boolean;
}

const EMPTY: FormState = {
  code: '',
  description: '',
  discountType: 'percentage',
  percentage: '20',
  amountMajor: '',
  startDate: '',
  endDate: '',
  usageLimit: '',
  perUserLimit: '1',
  applicablePlans: [],
  minAmountMajor: '0',
  isActive: true,
};

function toDateInput(seconds: number | null): string {
  if (!seconds) return '';
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function fromDateInput(value: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

export function CouponManager({
  initial,
  plans,
}: {
  initial: CouponRow[];
  plans: { code: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<CouponRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openEdit(row: CouponRow) {
    setErrors({});
    setEditing({
      id: row.id,
      code: row.code,
      description: row.description ?? '',
      discountType: row.discountType === 'fixed' ? 'fixed' : 'percentage',
      percentage: String(row.percentage ?? 20),
      amountMajor: row.amountMinor ? String(row.amountMinor / 100) : '',
      startDate: toDateInput(row.startDate),
      endDate: toDateInput(row.endDate),
      usageLimit: row.usageLimit ? String(row.usageLimit) : '',
      perUserLimit: String(row.perUserLimit),
      applicablePlans: row.applicablePlans,
      minAmountMajor: String(row.minAmountMinor / 100),
      isActive: row.isActive,
    });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setErrors({});

    const payload = {
      code: editing.code.trim().toUpperCase(),
      description: editing.description || undefined,
      discountType: editing.discountType,
      percentage: editing.discountType === 'percentage' ? Number(editing.percentage) : undefined,
      amountMinor:
        editing.discountType === 'fixed'
          ? Math.round(Number(editing.amountMajor || '0') * 100)
          : undefined,
      startDate: fromDateInput(editing.startDate),
      endDate: fromDateInput(editing.endDate),
      usageLimit: editing.usageLimit ? Number(editing.usageLimit) : null,
      perUserLimit: Number(editing.perUserLimit || '1'),
      applicablePlans: editing.applicablePlans,
      minAmountMinor: Math.round(Number(editing.minAmountMajor || '0') * 100),
      isActive: editing.isActive,
    };

    try {
      if (editing.id) {
        await api.patch('/api/admin/coupons', { ...payload, id: editing.id });
        toast.success('Coupon updated', payload.code);
      } else {
        await api.post('/api/admin/coupons', payload);
        toast.success('Coupon created', payload.code);
      }
      setEditing(null);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        const details = error.details as { issues?: { path: string; message: string }[] } | undefined;
        const mapped: Record<string, string> = {};
        for (const issue of details?.issues ?? []) if (issue.path) mapped[issue.path] = issue.message;
        setErrors(mapped);
        toast.error('Could not save coupon', error.message);
      } else {
        toast.error('Could not save coupon', 'Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/coupons?id=${encodeURIComponent(pendingDelete.id)}`);
      toast.success('Coupon deleted');
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

  const columns: Column<CouponRow>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (row) => (
        <CellStack
          primary={<code className="font-mono font-bold">{row.code}</code>}
          secondary={row.description ?? ''}
        />
      ),
    },
    {
      key: 'discount',
      header: 'Discount',
      render: (row) => (
        <span className="font-semibold">
          {row.discountType === 'percentage'
            ? `${row.percentage}% off`
            : `${formatMoney(row.amountMinor ?? 0)} off`}
        </span>
      ),
    },
    {
      key: 'usage',
      header: 'Used',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-body">
          {row.usedCount}
          {row.usageLimit ? ` / ${row.usageLimit}` : ''}
        </span>
      ),
    },
    {
      key: 'window',
      header: 'Valid',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-xs text-body">
          {row.startDate ? formatDate(row.startDate) : 'Now'} →{' '}
          {row.endDate ? formatDate(row.endDate) : 'No end'}
        </span>
      ),
    },
    {
      key: 'plans',
      header: 'Plans',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-xs text-body">
          {row.applicablePlans.length === 0 ? 'All paid plans' : row.applicablePlans.join(', ')}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const expired = row.endDate !== null && row.endDate < nowSec();
        const exhausted = row.usageLimit !== null && row.usedCount >= row.usageLimit;
        if (!row.isActive) return <Badge tone="neutral">Inactive</Badge>;
        if (expired) return <Badge tone="rose">Expired</Badge>;
        if (exhausted) return <Badge tone="marigold">Used up</Badge>;
        return <Badge tone="success">Active</Badge>;
      },
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
            aria-label={`Edit ${row.code}`}
            className="grid size-8 place-items-center rounded-lg text-body hover:bg-[var(--surface-sunken)]"
          >
            <EditIcon size={15} />
          </button>
          <button
            type="button"
            onClick={() => setPendingDelete(row)}
            aria-label={`Delete ${row.code}`}
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
          New coupon
        </Button>
      </div>

      <AdminTable
        caption="Discount coupons"
        columns={columns}
        rows={initial}
        rowKey={(row) => row.id}
        empty={
          <AdminEmpty
            title="No coupons yet"
            description="Create a code to offer a percentage or fixed discount on a paid plan."
          />
        }
      />

      <Modal
        open={editing !== null}
        onClose={() => !saving && setEditing(null)}
        title={editing?.id ? `Edit ${editing.code}` : 'New coupon'}
        size="md"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" fullWidth onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button fullWidth loading={saving} onClick={save}>
              Save coupon
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Coupon code"
                value={editing.code}
                onChange={(event) =>
                  setEditing({ ...editing, code: event.target.value.toUpperCase() })
                }
                error={errors.code}
                placeholder="DIWALI25"
                required
              />
              <Select
                label="Discount type"
                value={editing.discountType}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    discountType: event.target.value as 'percentage' | 'fixed',
                  })
                }
                options={[
                  { value: 'percentage', label: 'Percentage off' },
                  { value: 'fixed', label: 'Fixed amount off' },
                ]}
              />
            </div>

            <Textarea
              label="Internal description"
              value={editing.description}
              onChange={(event) => setEditing({ ...editing, description: event.target.value })}
              rows={2}
              maxLength={200}
            />

            {editing.discountType === 'percentage' ? (
              <Input
                type="number"
                label="Percentage off"
                value={editing.percentage}
                onChange={(event) => setEditing({ ...editing, percentage: event.target.value })}
                error={errors.percentage}
                min={1}
                max={100}
                required
              />
            ) : (
              <Input
                type="number"
                label="Amount off (₹)"
                value={editing.amountMajor}
                onChange={(event) => setEditing({ ...editing, amountMajor: event.target.value })}
                error={errors.amountMinor}
                min={1}
                required
              />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                type="date"
                label="Valid from"
                value={editing.startDate}
                onChange={(event) => setEditing({ ...editing, startDate: event.target.value })}
                hint="Leave blank to start immediately."
              />
              <Input
                type="date"
                label="Valid until"
                value={editing.endDate}
                onChange={(event) => setEditing({ ...editing, endDate: event.target.value })}
                hint="Leave blank for no expiry."
              />
              <Input
                type="number"
                label="Total usage limit"
                value={editing.usageLimit}
                onChange={(event) => setEditing({ ...editing, usageLimit: event.target.value })}
                min={1}
                hint="Blank means unlimited."
              />
              <Input
                type="number"
                label="Per-user limit"
                value={editing.perUserLimit}
                onChange={(event) => setEditing({ ...editing, perUserLimit: event.target.value })}
                min={1}
                max={100}
              />
              <Input
                type="number"
                label="Minimum order (₹)"
                value={editing.minAmountMajor}
                onChange={(event) => setEditing({ ...editing, minAmountMajor: event.target.value })}
                min={0}
                containerClassName="sm:col-span-2"
              />
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-bold">Applies to</legend>
              <p className="mb-1 text-xs text-faint">
                Select none to allow the coupon on every paid plan.
              </p>
              {plans.map((plan) => (
                <Checkbox
                  key={plan.code}
                  label={plan.name}
                  checked={editing.applicablePlans.includes(plan.code)}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      applicablePlans: event.target.checked
                        ? [...editing.applicablePlans, plan.code]
                        : editing.applicablePlans.filter((code) => code !== plan.code),
                    })
                  }
                />
              ))}
            </fieldset>

            <Checkbox
              label="Active"
              description="Inactive coupons are rejected at checkout."
              checked={editing.isActive}
              onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })}
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={remove}
        loading={deleting}
        title="Delete this coupon?"
        message={
          pendingDelete
            ? `“${pendingDelete.code}” will stop working immediately. Past redemptions are kept for accounting.`
            : ''
        }
        confirmLabel="Delete coupon"
      />
    </>
  );
}
