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
    description: coupon.description,
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


/* =========================== Admin writes ============================= */

import { desc } from 'drizzle-orm';

export interface CouponWriteInput {
  code: string;
  description?: string | null;
  discountType?: 'percentage' | 'fixed';
  percentage?: number | null;
  amountMinor?: number | null;
  currency?: string;
  startDate?: number | null;
  endDate?: number | null;
  usageLimit?: number | null;
  perUserLimit?: number;
  applicablePlans?: string[];
  minAmountMinor?: number;
  isActive?: boolean;
}

export interface CouponView {
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
  createdAt: number;
}

function toCouponView(row: typeof coupons.$inferSelect): CouponView {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    discountType: row.discountType,
    percentage: row.percentage,
    amountMinor: row.amountMinor,
    currency: row.currency,
    startDate: row.startDate,
    endDate: row.endDate,
    usageLimit: row.usageLimit,
    perUserLimit: row.perUserLimit,
    usedCount: row.usedCount,
    applicablePlans: parseJson<string[]>(row.applicablePlansJson, []),
    minAmountMinor: row.minAmountMinor,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

export async function listCoupons(): Promise<CouponView[]> {
  const rows = await db.select().from(coupons).orderBy(desc(coupons.createdAt));
  return rows.map(toCouponView);
}

export async function getCouponById(id: string): Promise<CouponView | null> {
  const rows = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
  return rows[0] ? toCouponView(rows[0]) : null;
}

function validateCouponInput(input: CouponWriteInput): void {
  const type = input.discountType ?? 'percentage';
  if (type === 'percentage') {
    const pct = input.percentage ?? 0;
    if (pct <= 0 || pct > 100) throw AppError.badRequest('Percentage must be between 1 and 100');
  } else {
    if ((input.amountMinor ?? 0) <= 0) throw AppError.badRequest('Fixed discount must be greater than zero');
  }
}

export async function createCoupon(input: CouponWriteInput, createdBy: string | null): Promise<CouponView> {
  if (!input.code?.trim()) throw AppError.badRequest('Code is required');
  validateCouponInput(input);
  const code = input.code.trim().toUpperCase();
  const existing = await getCouponByCode(code);
  if (existing) throw AppError.conflict('A coupon with that code already exists');
  const id = newId();
  const type = input.discountType ?? 'percentage';
  await db.insert(coupons).values({
    id,
    code,
    description: input.description ?? null,
    discountType: type,
    percentage: type === 'percentage' ? (input.percentage ?? 0) : null,
    amountMinor: type === 'fixed' ? (input.amountMinor ?? 0) : null,
    currency: input.currency ?? 'INR',
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    usageLimit: input.usageLimit ?? null,
    perUserLimit: input.perUserLimit ?? 1,
    applicablePlansJson: JSON.stringify(input.applicablePlans ?? []),
    minAmountMinor: input.minAmountMinor ?? 0,
    isActive: input.isActive ?? true,
    createdBy,
  });
  return (await getCouponById(id))!;
}

export async function updateCoupon(id: string, input: CouponWriteInput): Promise<CouponView> {
  const row = (await db.select().from(coupons).where(eq(coupons.id, id)).limit(1))[0];
  if (!row) throw AppError.notFound('Coupon not found');
  const type = input.discountType ?? (row.discountType as 'percentage' | 'fixed');
  if (input.discountType || input.percentage !== undefined || input.amountMinor !== undefined) {
    validateCouponInput({ ...input, discountType: type });
  }
  await db
    .update(coupons)
    .set({
      description: input.description ?? row.description,
      discountType: type,
      percentage: type === 'percentage' ? (input.percentage ?? row.percentage) : null,
      amountMinor: type === 'fixed' ? (input.amountMinor ?? row.amountMinor) : null,
      currency: input.currency ?? row.currency,
      startDate: input.startDate ?? row.startDate,
      endDate: input.endDate ?? row.endDate,
      usageLimit: input.usageLimit ?? row.usageLimit,
      perUserLimit: input.perUserLimit ?? row.perUserLimit,
      applicablePlansJson: input.applicablePlans
        ? JSON.stringify(input.applicablePlans)
        : row.applicablePlansJson,
      minAmountMinor: input.minAmountMinor ?? row.minAmountMinor,
      isActive: input.isActive ?? row.isActive,
      updatedAt: nowSec(),
    })
    .where(eq(coupons.id, id));
  return (await getCouponById(id))!;
}

export async function deleteCoupon(id: string): Promise<void> {
  const existing = await getCouponById(id);
  if (!existing) throw AppError.notFound('Coupon not found');
  await db.delete(coupons).where(eq(coupons.id, id));
}
