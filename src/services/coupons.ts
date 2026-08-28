import { and, count, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { couponRedemptions, coupons } from '@/db/schema';
import { AppError } from '@/lib/api';
import { nowSec } from '@/lib/dates';
import { newId } from '@/lib/id';
import { formatMoney, parseJson } from '@/lib/utils';
import type { PlanView } from './plans';

/**
 * Coupon validation.
 *
 * Every rule (window, usage caps, plan applicability, minimum spend) is checked
 * on the server; the discount amount returned here is what the order is created
 * with. A client can never influence the final price.
 */

export interface CouponEvaluation {
  couponId: string;
  code: string;
  description: string | null;
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
  if (!coupon || !coupon.isActive) {
    throw AppError.badRequest('That coupon code is not valid');
  }

  const now = nowSec();
  if (coupon.startDate && coupon.startDate > now) {
    throw AppError.badRequest('This coupon is not active yet');
  }
  if (coupon.endDate && coupon.endDate < now) {
    throw AppError.badRequest('This coupon has expired');
  }

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
    .where(
      and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.userId, input.userId)),
    );

  if ((perUser[0]?.value ?? 0) >= coupon.perUserLimit) {
    throw AppError.badRequest('You have already used this coupon');
  }

  const discountMinor =
    coupon.discountType === 'percentage'
      ? Math.floor((input.plan.priceMinor * (coupon.percentage ?? 0)) / 100)
      : Math.min(coupon.amountMinor ?? 0, input.plan.priceMinor);

  // Never let a discount produce a zero or negative charge — Razorpay rejects
  // orders below ₹1, and a free upgrade should be an admin grant instead.
  const capped = Math.min(discountMinor, Math.max(0, input.plan.priceMinor - 100));
  const finalAmountMinor = input.plan.priceMinor - capped;

  return {
    couponId: coupon.id,
    code: coupon.code,
    description: coupon.description,
    discountMinor: capped,
    finalAmountMinor,
    discountLabel:
      coupon.discountType === 'percentage'
        ? `${coupon.percentage}% off`
        : `${formatMoney(capped, input.plan.currency)} off`,
  };
}

/** Records a redemption after a payment has been captured. */
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

  const rows = await db
    .select({ usedCount: coupons.usedCount })
    .from(coupons)
    .where(eq(coupons.id, input.couponId))
    .limit(1);

  await db
    .update(coupons)
    .set({ usedCount: (rows[0]?.usedCount ?? 0) + 1, updatedAt: nowSec() })
    .where(eq(coupons.id, input.couponId));
}

/* -------------------------------- Admin CRUD ------------------------------- */

export interface CouponWriteInput {
  code: string;
  description?: string;
  discountType: 'percentage' | 'fixed';
  percentage?: number;
  amountMinor?: number;
  startDate?: number | null;
  endDate?: number | null;
  usageLimit?: number | null;
  perUserLimit: number;
  applicablePlans: string[];
  minAmountMinor: number;
  isActive: boolean;
}

export async function createCoupon(input: CouponWriteInput, createdBy: string) {
  const code = input.code.trim().toUpperCase();
  const existing = await getCouponByCode(code);
  if (existing) throw AppError.conflict('A coupon with that code already exists');

  const id = newId();
  await db.insert(coupons).values({
    id,
    code,
    description: input.description || null,
    discountType: input.discountType,
    percentage: input.discountType === 'percentage' ? input.percentage ?? null : null,
    amountMinor: input.discountType === 'fixed' ? input.amountMinor ?? null : null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    usageLimit: input.usageLimit ?? null,
    perUserLimit: input.perUserLimit,
    applicablePlansJson: JSON.stringify(input.applicablePlans),
    minAmountMinor: input.minAmountMinor,
    isActive: input.isActive,
    createdBy,
  });

  return { id, code };
}

export async function updateCoupon(id: string, input: CouponWriteInput) {
  await db
    .update(coupons)
    .set({
      code: input.code.trim().toUpperCase(),
      description: input.description || null,
      discountType: input.discountType,
      percentage: input.discountType === 'percentage' ? input.percentage ?? null : null,
      amountMinor: input.discountType === 'fixed' ? input.amountMinor ?? null : null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      usageLimit: input.usageLimit ?? null,
      perUserLimit: input.perUserLimit,
      applicablePlansJson: JSON.stringify(input.applicablePlans),
      minAmountMinor: input.minAmountMinor,
      isActive: input.isActive,
      updatedAt: nowSec(),
    })
    .where(eq(coupons.id, id));
}

export async function deleteCoupon(id: string) {
  await db.delete(coupons).where(eq(coupons.id, id));
}

export async function listCoupons() {
  return db
    .select({
      id: coupons.id,
      code: coupons.code,
      description: coupons.description,
      discountType: coupons.discountType,
      percentage: coupons.percentage,
      amountMinor: coupons.amountMinor,
      startDate: coupons.startDate,
      endDate: coupons.endDate,
      usageLimit: coupons.usageLimit,
      perUserLimit: coupons.perUserLimit,
      usedCount: coupons.usedCount,
      applicablePlansJson: coupons.applicablePlansJson,
      minAmountMinor: coupons.minAmountMinor,
      isActive: coupons.isActive,
      createdAt: coupons.createdAt,
    })
    .from(coupons)
    .orderBy(desc(coupons.createdAt));
}
