import { apiRequest } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import { AppError } from '@/lib/api';
import type { PlanView } from './plans';

/**
 * Coupons. Every rule (window, usage caps, plan eligibility, minimum order) is
 * re-checked by the API at order time, so this is presentation only.
 */

export interface CouponEvaluation {
  couponId: string;
  code: string;
  description: string | null;
  discountMinor: number;
  finalAmountMinor: number;
  discountLabel: string;
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

async function token(): Promise<string> {
  const value = await getAccessToken();
  if (!value) throw AppError.unauthorized();
  return value;
}

/** Previews a coupon against a plan. The API owns the arithmetic. */
export async function evaluateCoupon(input: {
  code: string;
  plan: PlanView;
  userId: string;
}): Promise<CouponEvaluation> {
  return apiRequest<CouponEvaluation>('/v1/payments/coupon', {
    method: 'POST',
    token: await token(),
    body: { code: input.code, planCode: input.plan.code },
  });
}

export async function listCoupons(): Promise<CouponView[]> {
  const data = await apiRequest<{ items: CouponView[] }>('/v1/admin/coupons', {
    token: await token(),
  });
  return data.items;
}

export async function createCoupon(
  input: CouponWriteInput,
  _createdBy: string,
): Promise<CouponView> {
  return apiRequest<CouponView>('/v1/admin/coupons', {
    method: 'POST',
    token: await token(),
    body: input,
  });
}

export async function updateCoupon(id: string, input: CouponWriteInput): Promise<CouponView> {
  return apiRequest<CouponView>(`/v1/admin/coupons/${encodeURIComponent(id)}`, {
    method: 'PUT',
    token: await token(),
    body: input,
  });
}

export async function deleteCoupon(id: string): Promise<void> {
  await apiRequest(`/v1/admin/coupons/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token: await token(),
  });
}
