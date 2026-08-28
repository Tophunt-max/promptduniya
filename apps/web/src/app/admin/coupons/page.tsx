import type { Metadata } from 'next';

import { AdminShell } from '@/components/admin/admin-shell';
import { CouponManager } from '@/components/admin/coupon-manager';
import { InfoIcon } from '@/components/ui/icon';
import { requireStrictAdminPage } from '@/lib/auth/guards';
import { parseJson } from '@/lib/utils';
import { listCoupons } from '@/services/coupons';
import { listPlans } from '@/services/plans';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Coupons' };

export default async function AdminCouponsPage() {
  await requireStrictAdminPage();
  const [coupons, plans] = await Promise.all([listCoupons(), listPlans({ activeOnly: false })]);

  return (
    <AdminShell
      title="Coupons"
      description="Discount codes for premium plans. Every rule is validated server-side at checkout."
    >
      <div className="card mb-5 flex items-start gap-3 p-4">
        <InfoIcon size={18} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-300" />
        <p className="text-sm leading-relaxed text-body">
          Coupons are re-validated when the order is created, not just when previewed — window,
          usage caps, per-user caps, plan applicability and minimum spend are all checked again. A
          discount can never reduce a charge below ₹1; for free access, grant premium from the user
          record instead.
        </p>
      </div>

      <CouponManager
        initial={coupons.map((coupon) => ({
          ...coupon,
          applicablePlans: parseJson<string[]>(coupon.applicablePlansJson, []),
        }))}
        plans={plans.filter((plan) => plan.priceMinor > 0).map((plan) => ({ code: plan.code, name: plan.name }))}
      />
    </AdminShell>
  );
}
