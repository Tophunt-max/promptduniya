import { apiRequest } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import { AppError } from '@/lib/api';

/**
 * Plan catalogue.
 *
 * Prices live only in the database behind the API. The browser sends a plan
 * *code* at checkout and the server looks up the authoritative amount — a
 * client-supplied price is never trusted.
 */

export interface PlanView {
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

export interface PlanWriteInput {
  code: string;
  name: string;
  description?: string;
  priceMinor: number;
  currency: string;
  billingPeriod: 'none' | 'month' | 'year' | 'lifetime';
  intervalCount: number;
  trialDays: number;
  features: string[];
  limits: Record<string, number>;
  razorpayPlanId?: string;
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
}

async function token(): Promise<string> {
  const value = await getAccessToken();
  if (!value) throw AppError.unauthorized();
  return value;
}

export async function listPlans(options: { activeOnly?: boolean } = {}): Promise<PlanView[]> {
  if (options.activeOnly === false) {
    const admin = await apiRequest<{ items: PlanView[] }>('/v1/admin/plans', {
      token: await token(),
    });
    return admin.items;
  }
  const data = await apiRequest<{ items: PlanView[] }>('/v1/catalog/plans', {
    revalidate: 300,
    tags: ['plans'],
  });
  return data.items;
}

/** Public pricing table — active plans only, cheapest first. */
export async function pricingTable(): Promise<PlanView[]> {
  return listPlans({ activeOnly: true });
}

export async function getPlanByCode(code: string): Promise<PlanView | null> {
  const plans = await listPlans({ activeOnly: true });
  return plans.find((p) => p.code === code) ?? null;
}

export async function getPlanById(id: string): Promise<PlanView | null> {
  const plans = await listPlans({ activeOnly: true });
  return plans.find((p) => p.id === id) ?? null;
}

/**
 * Resolves a purchasable plan for the checkout UI. The API re-validates this
 * when the order is created, so this is a convenience check, not the gate.
 */
export async function requirePurchasablePlan(code: string): Promise<PlanView> {
  const plan = await getPlanByCode(code);
  if (!plan) throw AppError.notFound('That plan does not exist');
  if (!plan.isActive) throw AppError.badRequest('That plan is no longer available');
  if (plan.priceMinor <= 0) throw AppError.badRequest('The free plan does not require a payment');
  return plan;
}

export async function upsertPlan(input: PlanWriteInput, id?: string): Promise<PlanView> {
  if (id) {
    return apiRequest<PlanView>(`/v1/admin/plans/${encodeURIComponent(id)}`, {
      method: 'PUT',
      token: await token(),
      body: input,
    });
  }
  return apiRequest<PlanView>('/v1/admin/plans', {
    method: 'POST',
    token: await token(),
    body: input,
  });
}

export async function setPlanActive(id: string, isActive: boolean): Promise<PlanView> {
  return apiRequest<PlanView>(`/v1/admin/plans/${encodeURIComponent(id)}/active`, {
    method: 'PATCH',
    token: await token(),
    body: { isActive },
  });
}

export async function deletePlan(id: string): Promise<void> {
  await apiRequest(`/v1/admin/plans/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token: await token(),
  });
}

/** Pure formatting helper — "per month", "one-time", etc. */
export function billingLabel(plan: PlanView): string {
  switch (plan.billingPeriod) {
    case 'month':
      return plan.intervalCount === 1 ? 'per month' : `every ${plan.intervalCount} months`;
    case 'year':
      return plan.intervalCount === 1 ? 'per year' : `every ${plan.intervalCount} years`;
    case 'lifetime':
      return 'one-time';
    default:
      return 'free';
  }
}
