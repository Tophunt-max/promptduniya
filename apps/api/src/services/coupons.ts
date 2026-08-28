import { couponRedemptions, coupons, db } from '@pd/db';
import { formatMoney } from '@pd/shared';
import { and, count, eq } from 'drizzle-orm';

import { AppError } from '../lib/errors';
import { nowSec } from '../lib/dates';
import { newId } from '../lib/crypto';
import type { PlanView } from './plans';

/** Coupon validation — every rule re-checked server-side at order time. */

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export interface CouponEvaluation {
  couponId: string;
  code: string;
  discountMinor: number;
  finalAmountMinor: number;
  discountLabel: string;
}

export async function getCouponByCode(code: string) {
  const rows = await db
    .select()
    .from(coupons)
    .where(eq(coupons.code, code.trim().toUpperCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function evaluateCoupon(input: {
  code: string;
  plan: PlanView;
  userId: string;
}): Promise<CouponEvaluation> {
  const coupon = await getCouponByCode(input.code);
  if (!coupon || !coupon.isActive) throw AppError.badRequest('That coupon code is not valid');

  const now = nowSec();
  if (coupon.startDate && coupon.startDate > now) throw AppError.badRequest('This coupon is not active yet');
  if (coupon.endDate && coupon.endDate < now) throw AppError.badRequest('This coupon has expired');
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw AppError.badRequest('This coupon has reached its usage limit');
  }

  const applicable = parseJson<string[]>(coupon.applicablePlansJson, []);
  if (applicable.length > 0 && !applicable.includes(input.plan.code)) {
    throw AppError.badRequest('This coupon does not apply to the selected plan');
  }
  if (input.plan.priceMinor < coupon.minAmountMinor) {
    throw AppError.badRequest(
      `This coupon needs a minimum order of ${formatMoney(coupon.minAmountMinor, input.plan.currency)}`,
    );
  }

  const perUser = await db
    .select({ value: count() })
    .from(couponRedemptions)
    .where(and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.userId, input.userId)));
  if ((perUser[0]?.value ?? 0) >= coupon.perUserLimit) {
    throw AppError.badRequest('You have already used this coupon');
  }

  const raw =
    coupon.discountType === 'percentage'
      ? Math.floor((input.plan.priceMinor * (coupon.percentage ?? 0)) / 100)
      : Math.min(coupon.amountMinor ?? 0, input.plan.priceMinor);
  // Never reduce a charge below ₹1.
  const discountMinor = Math.min(raw, Math.max(0, input.plan.priceMinor - 100));

  return {
    couponId: coupon.id,
    code: coupon.code,
    discountMinor,
    finalAmountMinor: input.plan.priceMinor - discountMinor,
    discountLabel:
      coupon.discountType === 'percentage'
        ? `${coupon.percentage}% off`
        : `${formatMoney(discountMinor, input.plan.currency)} off`,
  };
}

export async function redeemCoupon(input: {
  couponId: string;
  userId: string;
  paymentId: string | null;
  discountMinor: number;
}): Promise<void> {
  await db.insert(couponRedemptions).values({
    id: newId(),
    couponId: input.couponId,
    userId: input.userId,
    paymentId: input.paymentId,
    discountMinor: input.discountMinor,
  });
  const rows = await db.select({ usedCount: coupons.usedCount }).from(coupons).where(eq(coupons.id, input.couponId)).limit(1);
  await db
    .update(coupons)
    .set({ usedCount: (rows[0]?.usedCount ?? 0) + 1, updatedAt: nowSec() })
    .where(eq(coupons.id, input.couponId));
}
