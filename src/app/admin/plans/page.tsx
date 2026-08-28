import type { Metadata } from 'next';

import { AdminShell } from '@/components/admin/admin-shell';
import { PlanManager } from '@/components/admin/plan-manager';
import { InfoIcon } from '@/components/ui/icon';
import { requireStrictAdminPage } from '@/lib/auth/guards';
import { listPlans } from '@/services/plans';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Plans' };

export default async function AdminPlansPage() {
  await requireStrictAdminPage();
  const plans = await listPlans({ activeOnly: false });

  return (
    <AdminShell
      title="Plans and pricing"
      description="Prices, billing periods and per-plan limits. These values are the only source of truth for checkout."
    >
      <div className="card mb-5 flex items-start gap-3 p-4">
        <InfoIcon size={18} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-300" />
        <p className="text-sm leading-relaxed text-body">
          When a member checks out, the server reads the price from this table and ignores anything
          the browser sends. Changing a price here affects new purchases only — existing
          subscriptions keep the terms they were bought under. Every change is written to the audit
          log. Use <code className="rounded bg-[var(--surface-sunken)] px-1">−1</code> for an
          unlimited limit.
        </p>
      </div>

      <PlanManager initial={plans} />
    </AdminShell>
  );
}
