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
  formatMoney,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/use-api';

interface PlanRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  billingPeriod: 'none' | 'month' | 'year' | 'lifetime';
  intervalCount: number;
  trialDays: number;
  features: string[];
  limits: Record<string, number>;
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
  razorpayPlanId: string | null;
}

interface FormState {
  code: string;
  name: string;
  description: string;
  /** Rupees in the form; converted to paise before sending. */
  price: number;
  billingPeriod: 'none' | 'month' | 'year' | 'lifetime';
  intervalCount: number;
  trialDays: number;
  features: string;
  copiesPerDay: number;
  favorites: number;
  generatorPerDay: number;
  razorpayPlanId: string;
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
}

const BLANK: FormState = {
  code: '',
  name: '',
  description: '',
  price: 0,
  billingPeriod: 'month',
  intervalCount: 1,
  trialDays: 0,
  features: '',
  copiesPerDay: -1,
  favorites: -1,
  generatorPerDay: -1,
  razorpayPlanId: '',
  isActive: true,
  isPopular: false,
  sortOrder: 0,
};

export function PlansPage() {
  const plans = useQuery<{ items: PlanRow[] }>('/v1/admin/plans');
  const { run, pending, error, fieldErrors } = useMutation();

  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(BLANK);

  function openCreate() {
    setForm(BLANK);
    setEditing(null);
    setOpen(true);
  }

  function openEdit(plan: PlanRow) {
    setForm({
      code: plan.code,
      name: plan.name,
      description: plan.description ?? '',
      price: plan.priceMinor / 100,
      billingPeriod: plan.billingPeriod,
      intervalCount: plan.intervalCount,
      trialDays: plan.trialDays,
      features: plan.features.join('\n'),
      copiesPerDay: plan.limits.copiesPerDay ?? -1,
      favorites: plan.limits.favorites ?? -1,
      generatorPerDay: plan.limits.generatorPerDay ?? -1,
      razorpayPlanId: plan.razorpayPlanId ?? '',
      isActive: plan.isActive,
      isPopular: plan.isPopular,
      sortOrder: plan.sortOrder,
    });
    setEditing(plan);
    setOpen(true);
  }

  async function save() {
    const payload = {
      code: form.code,
      name: form.name,
      description: form.description || undefined,
      // Prices are stored in paise; the API is the only source of truth at checkout.
      priceMinor: Math.round(form.price * 100),
      currency: 'INR',
      billingPeriod: form.billingPeriod,
      intervalCount: form.intervalCount,
      trialDays: form.trialDays,
      features: form.features
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      limits: {
        copiesPerDay: form.copiesPerDay,
        favorites: form.favorites,
        generatorPerDay: form.generatorPerDay,
      },
      razorpayPlanId: form.razorpayPlanId || undefined,
      isActive: form.isActive,
      isPopular: form.isPopular,
      sortOrder: form.sortOrder,
    };

    const saved = await run(() =>
      editing
        ? api.put(`/v1/admin/plans/${encodeURIComponent(editing.id)}`, payload)
        : api.post('/v1/admin/plans', payload),
    );
    if (saved !== null) {
      setOpen(false);
      plans.reload();
    }
  }

  async function toggleActive(plan: PlanRow) {
    const ok = await run(() =>
      api.patch(`/v1/admin/plans/${encodeURIComponent(plan.id)}/active`, {
        isActive: !plan.isActive,
      }),
    );
    if (ok !== null) plans.reload();
  }

  return (
    <>
      <PageHeader
        title="Plans"
        description="Prices live only in the database — the checkout amount is always derived server-side."
        actions={<Button onClick={openCreate}>New plan</Button>}
      />

      {error && !open && <Alert>{error}</Alert>}

      <Card>
        {plans.error && <Alert>{plans.error}</Alert>}
        {plans.loading && !plans.data && <Spinner label="Loading plans" />}
        {plans.data?.items.length === 0 && <EmptyState>No plans configured.</EmptyState>}

        {plans.data && plans.data.items.length > 0 && (
          <Table head={['Plan', 'Price', 'Billing', 'Limits', '']}>
            {plans.data.items.map((plan) => (
              <Row key={plan.id}>
                <Cell>
                  <span className="font-semibold text-ink">{plan.name}</span>
                  <p className="font-mono text-xs text-muted">{plan.code}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge tone={plan.isActive ? 'success' : 'warning'}>
                      {plan.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    {plan.isPopular && <Badge tone="brand">Popular</Badge>}
                  </div>
                </Cell>
                <Cell className="whitespace-nowrap font-semibold text-ink">
                  {formatMoney(plan.priceMinor, plan.currency)}
                </Cell>
                <Cell className="whitespace-nowrap text-xs">
                  {plan.billingPeriod === 'none'
                    ? 'Free'
                    : plan.billingPeriod === 'lifetime'
                      ? 'One-time'
                      : `Every ${plan.intervalCount} ${plan.billingPeriod}(s)`}
                </Cell>
                <Cell className="text-xs">
                  {Object.entries(plan.limits)
                    .map(([key, value]) => `${key}: ${value < 0 ? '∞' : value}`)
                    .join(' · ') || '—'}
                </Cell>
                <Cell>
                  <div className="flex justify-end gap-1">
                    <Button variant="outline" size="sm" onClick={() => openEdit(plan)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => void toggleActive(plan)}
                    >
                      {plan.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      {open && (
        <Modal title={editing ? `Edit ${editing.name}` : 'New plan'} onClose={() => setOpen(false)} wide>
          <div className="space-y-4">
            {error && <Alert>{error}</Alert>}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Code"
                hint="Lowercase, dashes. Used by checkout."
                error={fieldErrors.code}
              >
                <Input
                  value={form.code}
                  disabled={editing !== null}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </Field>
              <Field label="Name" error={fieldErrors.name}>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Description" error={fieldErrors.description}>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Price (₹)" error={fieldErrors.priceMinor}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                />
              </Field>
              <Field label="Billing period">
                <Select
                  value={form.billingPeriod}
                  onChange={(e) =>
                    setForm({ ...form, billingPeriod: e.target.value as FormState['billingPeriod'] })
                  }
                >
                  <option value="none">Free</option>
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                  <option value="lifetime">Lifetime</option>
                </Select>
              </Field>
              <Field label="Interval count">
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={form.intervalCount}
                  onChange={(e) => setForm({ ...form, intervalCount: Number(e.target.value) })}
                />
              </Field>
              <Field label="Trial days">
                <Input
                  type="number"
                  min={0}
                  max={90}
                  value={form.trialDays}
                  onChange={(e) => setForm({ ...form, trialDays: Number(e.target.value) })}
                />
              </Field>
            </div>

            <Field label="Features" hint="One bullet per line.">
              <Textarea
                rows={5}
                value={form.features}
                onChange={(e) => setForm({ ...form, features: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Copies / day" hint="-1 for unlimited.">
                <Input
                  type="number"
                  min={-1}
                  value={form.copiesPerDay}
                  onChange={(e) => setForm({ ...form, copiesPerDay: Number(e.target.value) })}
                />
              </Field>
              <Field label="Favourites" hint="-1 for unlimited.">
                <Input
                  type="number"
                  min={-1}
                  value={form.favorites}
                  onChange={(e) => setForm({ ...form, favorites: Number(e.target.value) })}
                />
              </Field>
              <Field label="Generator / day" hint="-1 for unlimited.">
                <Input
                  type="number"
                  min={-1}
                  value={form.generatorPerDay}
                  onChange={(e) => setForm({ ...form, generatorPerDay: Number(e.target.value) })}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Razorpay plan id" hint="Optional; for gateway subscriptions.">
                <Input
                  value={form.razorpayPlanId}
                  onChange={(e) => setForm({ ...form, razorpayPlanId: e.target.value })}
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
                label="Mark as popular"
                checked={form.isPopular}
                onChange={(e) => setForm({ ...form, isPopular: e.target.checked })}
              />
            </div>

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
