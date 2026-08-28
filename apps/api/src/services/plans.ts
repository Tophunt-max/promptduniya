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
