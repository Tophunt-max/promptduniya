import { asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { plans } from '@/db/schema';
import { AppError } from '@/lib/api';
import { nowSec } from '@/lib/dates';
import { newId } from '@/lib/id';
import { parseJson } from '@/lib/utils';

/**
 * Plan catalogue.
 *
 * Prices live only in the database. The browser sends a plan *code*; the server
 * looks up the authoritative price. A client-supplied amount is never trusted.
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

function toView(row: typeof plans.$inferSelect): PlanView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    priceMinor: row.priceMinor,
    currency: row.currency,
    billingPeriod: row.billingPeriod as PlanView['billingPeriod'],
    intervalCount: row.intervalCount,
    trialDays: row.trialDays,
    features: parseJson<string[]>(row.featuresJson, []),
    limits: parseJson<Record<string, number>>(row.limitsJson, {}),
    isActive: row.isActive,
    isPopular: row.isPopular,
    sortOrder: row.sortOrder,
    razorpayPlanId: row.razorpayPlanId,
  };
}

export async function listPlans(options: { activeOnly?: boolean } = {}): Promise<PlanView[]> {
  const rows = await db
    .select()
    .from(plans)
    .where(options.activeOnly === false ? undefined : eq(plans.isActive, true))
    .orderBy(asc(plans.sortOrder), asc(plans.priceMinor));
  return rows.map(toView);
}

export async function getPlanByCode(code: string): Promise<PlanView | null> {
  const rows = await db.select().from(plans).where(eq(plans.code, code)).limit(1);
  return rows[0] ? toView(rows[0]) : null;
}

export async function getPlanById(id: string): Promise<PlanView | null> {
  const rows = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  return rows[0] ? toView(rows[0]) : null;
}

/** Loads a purchasable plan, rejecting the free tier and inactive plans. */
export async function requirePurchasablePlan(code: string): Promise<PlanView> {
  const plan = await getPlanByCode(code);
  if (!plan) throw AppError.notFound('That plan does not exist');
  if (!plan.isActive) throw AppError.badRequest('That plan is no longer available');
  if (plan.priceMinor <= 0) throw AppError.badRequest('The free plan does not require a payment');
  return plan;
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

export async function upsertPlan(input: PlanWriteInput, id?: string) {
  const values = {
    code: input.code,
    name: input.name,
    description: input.description || null,
    priceMinor: input.priceMinor,
    currency: input.currency,
    billingPeriod: input.billingPeriod,
    intervalCount: input.intervalCount,
    trialDays: input.trialDays,
    featuresJson: JSON.stringify(input.features),
    limitsJson: JSON.stringify(input.limits),
    razorpayPlanId: input.razorpayPlanId || null,
    isActive: input.isActive,
    isPopular: input.isPopular,
    sortOrder: input.sortOrder,
    updatedAt: nowSec(),
  };

  if (id) {
    await db.update(plans).set(values).where(eq(plans.id, id));
    return { id };
  }

  const existing = await getPlanByCode(input.code);
  if (existing) {
    await db.update(plans).set(values).where(eq(plans.id, existing.id));
    return { id: existing.id };
  }

  const newPlanId = newId();
  await db.insert(plans).values({ id: newPlanId, ...values });
  return { id: newPlanId };
}

export async function setPlanActive(id: string, isActive: boolean) {
  await db.update(plans).set({ isActive, updatedAt: nowSec() }).where(eq(plans.id, id));
}

export async function deletePlan(id: string) {
  const plan = await getPlanById(id);
  if (!plan) throw AppError.notFound('Plan not found');
  if (plan.code === 'free') throw AppError.badRequest('The free plan cannot be deleted');
  // Soft-delete: subscriptions reference plans, so deactivate instead.
  await setPlanActive(id, false);
}

/** Public pricing payload — safe to render, prices come from the database. */
export async function pricingTable(): Promise<PlanView[]> {
  const all = await listPlans({ activeOnly: true });
  return all.sort((a, b) => a.sortOrder - b.sortOrder || a.priceMinor - b.priceMinor);
}

export function billingLabel(plan: PlanView): string {
  switch (plan.billingPeriod) {
    case 'month':
      return plan.intervalCount > 1 ? `every ${plan.intervalCount} months` : 'per month';
    case 'year':
      return plan.intervalCount > 1 ? `every ${plan.intervalCount} years` : 'per year';
    case 'lifetime':
      return 'one-time';
    default:
      return 'free forever';
  }
}
