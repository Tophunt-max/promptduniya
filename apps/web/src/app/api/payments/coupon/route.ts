import { handle, ok, parseBody } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { formatMoney } from '@/lib/utils';
import { couponCheckSchema } from '@/lib/validation';
import { evaluateCoupon } from '@/services/coupons';
import { requirePurchasablePlan } from '@/services/plans';

export const dynamic = 'force-dynamic';

/**
 * Validates a coupon against a plan.
 *
 * Purely informational for the UI — the discount is recalculated server-side
 * again when the order is created, so a stale or forged preview cannot affect
 * the amount actually charged.
 */
export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('coupon');

  const user = await requireUser();
  const body = await parseBody(request, couponCheckSchema);

  const plan = await requirePurchasablePlan(body.planCode);
  const evaluation = await evaluateCoupon({ code: body.code, plan, userId: user.id });

  return ok({
    code: evaluation.code,
    description: evaluation.description,
    discountMinor: evaluation.discountMinor,
    discountLabel: evaluation.discountLabel,
    finalAmountMinor: evaluation.finalAmountMinor,
    finalAmountLabel: formatMoney(evaluation.finalAmountMinor, plan.currency),
    originalAmountLabel: formatMoney(plan.priceMinor, plan.currency),
  });
});
