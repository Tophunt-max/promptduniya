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
  Textarea,
  formatDate,
  formatMoney,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/use-api';

interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  percentage: number | null;
  amountMinor: number | null;
  currency: string;
  startDate: number | null;
  endDate: number | null;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  applicablePlans: string[];
  minAmountMinor: number;
  isActive: boolean;
}

interface PlanRow {
  code: string;
  name: string;
  priceMinor: number;
}

interface FormState {
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  percentage: number;
  /** Rupees; converted to paise on submit. */
  amount: number;
  usageLimit: string;
  perUserLimit: number;
  minAmount: number;
  applicablePlans: string[];
  isActive: boolean;
}

const BLANK: FormState = {
  code: '',
  description: '',
  discountType: 'percentage',
  percentage: 10,
  amount: 0,
  usageLimit: '',
  perUserLimit: 1,
  minAmount: 0,
  applicablePlans: [],
  isActive: true,
};

export function CouponsPage() {
  const coupons = useQuery<{ items: CouponRow[] }>('/v1/admin/coupons');
  const plans = useQuery<{ items: PlanRow[] }>('/v1/admin/plans');
  const { run, pending, error, fieldErrors } = useMutation();

  const [editing, setEditing] = useState<CouponRow | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(BLANK);

  function openCreate() {
    setForm(BLANK);
    setEditing(null);
    setOpen(true);
  }

  function openEdit(coupon: CouponRow) {
    setForm({
      code: coupon.code,
      description: coupon.description ?? '',
      discountType: coupon.discountType === 'fixed' ? 'fixed' : 'percentage',
      percentage: coupon.percentage ?? 10,
      amount: (coupon.amountMinor ?? 0) / 100,
      usageLimit: coupon.usageLimit === null ? '' : String(coupon.usageLimit),
      perUserLimit: coupon.perUserLimit,
      minAmount: coupon.minAmountMinor / 100,
      applicablePlans: coupon.applicablePlans,
      isActive: coupon.isActive,
    });
    setEditing(coupon);
    setOpen(true);
  }

  async function save() {
    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description || undefined,
      discountType: form.discountType,
      percentage: form.discountType === 'percentage' ? form.percentage : undefined,
      amountMinor: form.discountType === 'fixed' ? Math.round(form.amount * 100) : undefined,
      usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
      perUserLimit: form.perUserLimit,
      minAmountMinor: Math.round(form.minAmount * 100),
      applicablePlans: form.applicablePlans,
      isActive: form.isActive,
    };

    const saved = await run(() =>
      editing
        ? api.put(`/v1/admin/coupons/${encodeURIComponent(editing.id)}`, payload)
        : api.post('/v1/admin/coupons', payload),
    );
    if (saved !== null) {
      setOpen(false);
      coupons.reload();
    }
  }

  async function remove(coupon: CouponRow) {
    if (!window.confirm(`Delete coupon ${coupon.code}?`)) return;
    const ok = await run(() => api.delete(`/v1/admin/coupons/${encodeURIComponent(coupon.id)}`));
    if (ok !== null) coupons.reload();
  }

  function togglePlan(code: string) {
    setForm((prev) => ({
      ...prev,
      applicablePlans: prev.applicablePlans.includes(code)
        ? prev.applicablePlans.filter((item) => item !== code)
        : [...prev.applicablePlans, code],
    }));
  }

  return (
    <>
      <PageHeader
        title="Coupons"
        description="Every rule is re-checked by the API when an order is created."
        actions={<Button onClick={openCreate}>New coupon</Button>}
      />

      {error && !open && <Alert>{error}</Alert>}

      <Card>
        {coupons.error && <Alert>{coupons.error}</Alert>}
        {coupons.loading && !coupons.data && <Spinner label="Loading coupons" />}
        {coupons.data?.items.length === 0 && <EmptyState>No coupons yet.</EmptyState>}

        {coupons.data && coupons.data.items.length > 0 && (
          <Table head={['Code', 'Discount', 'Usage', 'Window', 'Plans', '']}>
            {coupons.data.items.map((coupon) => (
              <Row key={coupon.id}>
                <Cell>
                  <span className="font-mono font-bold text-ink">{coupon.code}</span>
                  <div className="mt-1">
                    <Badge tone={coupon.isActive ? 'success' : 'warning'}>
                      {coupon.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </Cell>
                <Cell className="whitespace-nowrap font-semibold text-ink">
                  {coupon.discountType === 'percentage'
                    ? `${coupon.percentage}% off`
                    : `${formatMoney(coupon.amountMinor ?? 0, coupon.currency)} off`}
                </Cell>
                <Cell className="whitespace-nowrap text-xs">
                  {coupon.usedCount} used
                  {coupon.usageLimit !== null ? ` / ${coupon.usageLimit}` : ''}
                  <br />
                  {coupon.perUserLimit} per member
                </Cell>
                <Cell className="whitespace-nowrap text-xs">
                  {coupon.startDate || coupon.endDate
                    ? `${formatDate(coupon.startDate)} → ${formatDate(coupon.endDate)}`
                    : 'Always'}
                </Cell>
                <Cell className="text-xs">
                  {coupon.applicablePlans.length === 0 ? 'All' : coupon.applicablePlans.join(', ')}
                </Cell>
                <Cell>
                  <div className="flex justify-end gap-1">
                    <Button variant="outline" size="sm" onClick={() => openEdit(coupon)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => void remove(coupon)}
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
        <Modal
          title={editing ? `Edit ${editing.code}` : 'New coupon'}
          onClose={() => setOpen(false)}
        >
          <div className="space-y-4">
            {error && <Alert>{error}</Alert>}

            <Field label="Code" hint="Uppercased automatically." error={fieldErrors.code}>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </Field>

            <Field label="Description" error={fieldErrors.description}>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Discount type">
                <Select
                  value={form.discountType}
                  onChange={(e) =>
                    setForm({ ...form, discountType: e.target.value as 'percentage' | 'fixed' })
                  }
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed amount</option>
                </Select>
              </Field>

              {form.discountType === 'percentage' ? (
                <Field label="Percentage off" error={fieldErrors.percentage}>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={form.percentage}
                    onChange={(e) => setForm({ ...form, percentage: Number(e.target.value) })}
                  />
                </Field>
              ) : (
                <Field label="Amount off (₹)" error={fieldErrors.amountMinor}>
                  <Input
                    type="number"
                    min={1}
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                  />
                </Field>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Total uses" hint="Blank = unlimited.">
                <Input
                  type="number"
                  min={1}
                  value={form.usageLimit}
                  onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                />
              </Field>
              <Field label="Per member">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={form.perUserLimit}
                  onChange={(e) => setForm({ ...form, perUserLimit: Number(e.target.value) })}
                />
              </Field>
              <Field label="Minimum order (₹)">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.minAmount}
                  onChange={(e) => setForm({ ...form, minAmount: Number(e.target.value) })}
                />
              </Field>
            </div>

            <fieldset>
              <legend className="mb-1 text-sm font-semibold text-ink">Applicable plans</legend>
              <p className="mb-2 text-xs text-muted">Select none to allow every paid plan.</p>
              <div className="flex flex-wrap gap-3">
                {(plans.data?.items ?? [])
                  .filter((plan) => plan.priceMinor > 0)
                  .map((plan) => (
                    <Checkbox
                      key={plan.code}
                      label={plan.name}
                      checked={form.applicablePlans.includes(plan.code)}
                      onChange={() => togglePlan(plan.code)}
                    />
                  ))}
              </div>
            </fieldset>

            <Checkbox
              label="Active"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
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
