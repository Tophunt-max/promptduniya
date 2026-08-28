import { db, plans } from '@pd/db';
import { asc, eq } from 'drizzle-orm';

import { AppError } from '../lib/errors';

/**
 * Plan catalogue. Prices live only in D1; the browser sends a plan *code* and
 * the server looks up the authoritative price — a client amount is never used.
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
  features: string[];
  limits: Record<string, number>;
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
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
    features: parseJson<string[]>(row.featuresJson, []),
    limits: parseJson<Record<string, number>>(row.limitsJson, {}),
    isActive: row.isActive,
    isPopular: row.isPopular,
    sortOrder: row.sortOrder,
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

export async function requirePurchasablePlan(code: string): Promise<PlanView> {
  const plan = await getPlanByCode(code);
  if (!plan) throw AppError.notFound('That plan does not exist');
  if (!plan.isActive) throw AppError.badRequest('That plan is no longer available');
  if (plan.priceMinor <= 0) throw AppError.badRequest('The free plan does not require a payment');
  return plan;
}

export function periodEnd(plan: PlanView, from: number): number | null {
  const d = new Date(from * 1000);
  const day = d.getUTCDate();
  switch (plan.billingPeriod) {
    case 'month':
      d.setUTCMonth(d.getUTCMonth() + plan.intervalCount);
      if (d.getUTCDate() < day) d.setUTCDate(0);
      return Math.floor(d.getTime() / 1000);
    case 'year':
      d.setUTCFullYear(d.getUTCFullYear() + plan.intervalCount);
      return Math.floor(d.getTime() / 1000);
    default:
      return null; // lifetime / none
  }
}


/* =========================== Admin writes ============================= */

import { newId } from '../lib/crypto';
import { nowSec } from '../lib/dates';
import { slugify } from '@pd/shared';

export interface PlanWriteInput {
  code?: string;
  name: string;
  description?: string | null;
  priceMinor?: number;
  currency?: string;
  billingPeriod?: PlanView['billingPeriod'];
  intervalCount?: number;
  trialDays?: number;
  features?: string[];
  limits?: Record<string, number>;
  razorpayPlanId?: string | null;
  isActive?: boolean;
  isPopular?: boolean;
  sortOrder?: number;
}

/** Admin listing returns inactive plans too. */
export async function adminListPlans(): Promise<PlanView[]> {
  return listPlans({ activeOnly: false });
}

export async function createPlan(input: PlanWriteInput): Promise<PlanView> {
  if (!input.name?.trim()) throw AppError.badRequest('Name is required');
  const code = (input.code || slugify(input.name) || 'plan').toLowerCase();
  const existing = await getPlanByCode(code);
  if (existing) throw AppError.conflict('A plan with that code already exists');
  const id = newId();
  await db.insert(plans).values({
    id,
    code,
    name: input.name,
    description: input.description ?? null,
    priceMinor: input.priceMinor ?? 0,
    currency: input.currency ?? 'INR',
    billingPeriod: input.billingPeriod ?? 'none',
    intervalCount: input.intervalCount ?? 1,
    trialDays: input.trialDays ?? 0,
    featuresJson: JSON.stringify(input.features ?? []),
    limitsJson: JSON.stringify(input.limits ?? {}),
    razorpayPlanId: input.razorpayPlanId ?? null,
    isActive: input.isActive ?? true,
    isPopular: input.isPopular ?? false,
    sortOrder: input.sortOrder ?? 0,
  });
  return (await getPlanById(id))!;
}

export async function updatePlan(id: string, input: PlanWriteInput): Promise<PlanView> {
  const existing = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  const row = existing[0];
  if (!row) throw AppError.notFound('Plan not found');
  await db
    .update(plans)
    .set({
      name: input.name ?? row.name,
      description: input.description ?? row.description,
      priceMinor: input.priceMinor ?? row.priceMinor,
      currency: input.currency ?? row.currency,
      billingPeriod: input.billingPeriod ?? row.billingPeriod,
      intervalCount: input.intervalCount ?? row.intervalCount,
      trialDays: input.trialDays ?? row.trialDays,
      featuresJson: input.features ? JSON.stringify(input.features) : row.featuresJson,
      limitsJson: input.limits ? JSON.stringify(input.limits) : row.limitsJson,
      razorpayPlanId: input.razorpayPlanId ?? row.razorpayPlanId,
      isActive: input.isActive ?? row.isActive,
      isPopular: input.isPopular ?? row.isPopular,
      sortOrder: input.sortOrder ?? row.sortOrder,
      updatedAt: nowSec(),
    })
    .where(eq(plans.id, id));
  return (await getPlanById(id))!;
}

export async function setPlanActive(id: string, isActive: boolean): Promise<PlanView> {
  const existing = await getPlanById(id);
  if (!existing) throw AppError.notFound('Plan not found');
  await db.update(plans).set({ isActive, updatedAt: nowSec() }).where(eq(plans.id, id));
  return (await getPlanById(id))!;
}

export async function deletePlan(id: string): Promise<void> {
  const existing = await getPlanById(id);
  if (!existing) throw AppError.notFound('Plan not found');
  await db.delete(plans).where(eq(plans.id, id));
}
