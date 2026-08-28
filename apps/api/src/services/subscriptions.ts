import { db, plans, subscriptions, users } from '@pd/db';
import { and, count, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';

import { AppError } from '../lib/errors';
import { addDays, nowSec } from '../lib/dates';
import { newId } from '../lib/crypto';
import { activatePremium, deactivatePremium } from './entitlements';
import { notify } from './notifications';

export interface SubscriptionView {
  id: string;
  status: string;
  planCode: string;
  planName: string;
  priceMinor: number;
  currency: string;
  billingPeriod: string;
  startDate: number | null;
  endDate: number | null;
  autoRenew: boolean;
  createdAt: number;
}

export async function currentSubscription(userId: string): Promise<SubscriptionView | null> {
  const rows = await db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      planCode: plans.code,
      planName: plans.name,
      priceMinor: plans.priceMinor,
      currency: plans.currency,
      billingPeriod: plans.billingPeriod,
      startDate: subscriptions.startDate,
      endDate: subscriptions.endDate,
      autoRenew: subscriptions.autoRenew,
      createdAt: subscriptions.createdAt,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, ['active', 'past_due'])))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function subscriptionHistory(userId: string): Promise<SubscriptionView[]> {
  return db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      planCode: plans.code,
      planName: plans.name,
      priceMinor: plans.priceMinor,
      currency: plans.currency,
      billingPeriod: plans.billingPeriod,
      startDate: subscriptions.startDate,
      endDate: subscriptions.endDate,
      autoRenew: subscriptions.autoRenew,
      createdAt: subscriptions.createdAt,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt));
}

export async function cancelSubscription(userId: string, subscriptionId: string) {
  const rows = await db
    .select({ id: subscriptions.id, userId: subscriptions.userId, endDate: subscriptions.endDate })
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1);
  const sub = rows[0];
  if (!sub) throw AppError.notFound('Subscription not found');
  if (sub.userId !== userId) throw AppError.forbidden();

  await db
    .update(subscriptions)
    .set({ autoRenew: false, cancelledAt: nowSec(), updatedAt: nowSec() })
    .where(eq(subscriptions.id, subscriptionId));
  return { autoRenew: false, accessUntil: sub.endDate };
}

/** Manual premium grant (support / admin). Creates a real subscription row. */
export async function grantPremium(input: { userId: string; planCode?: string; days: number }) {
  const planRows = await db
    .select({ id: plans.id, name: plans.name })
    .from(plans)
    .where(eq(plans.code, input.planCode ?? 'monthly'))
    .limit(1);
  const plan = planRows[0];
  if (!plan) throw AppError.badRequest('No plan available to grant');

  const start = nowSec();
  const end = addDays(start, input.days);
  const subscriptionId = newId();

  await db
    .update(subscriptions)
    .set({ status: 'expired', updatedAt: nowSec() })
    .where(and(eq(subscriptions.userId, input.userId), eq(subscriptions.status, 'active')));

  await db.insert(subscriptions).values({
    id: subscriptionId,
    userId: input.userId,
    planId: plan.id,
    provider: 'manual',
    status: 'active',
    startDate: start,
    endDate: end,
    autoRenew: false,
  });
  await activatePremium({ userId: input.userId, subscriptionId, expiresAt: end });
  return { subscriptionId, endsAt: end };
}

export async function revokePremium(userId: string): Promise<void> {
  await db
    .update(subscriptions)
    .set({ status: 'cancelled', cancelledAt: nowSec(), autoRenew: false, updatedAt: nowSec() })
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')));
  await deactivatePremium(userId);
}

/** Sweeps expired subscriptions. Intended for a scheduled Worker. */
export async function expireDueSubscriptions(): Promise<number> {
  const due = await db
    .select({ id: subscriptions.id, userId: subscriptions.userId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, 'active'),
        sql`${subscriptions.endDate} is not null`,
        lt(subscriptions.endDate, nowSec()),
      ),
    );
  for (const sub of due) {
    await db.update(subscriptions).set({ status: 'expired', updatedAt: nowSec() }).where(eq(subscriptions.id, sub.id));
    await deactivatePremium(sub.userId);
  }
  return due.length;
}


/**
 * Notifies members whose non-renewing membership lapses within `days`.
 * Driven by the scheduled worker.
 */
export async function remindExpiringSubscriptions(days = 5): Promise<number> {
  const horizon = addDays(nowSec(), days);
  const due = await db
    .select({ userId: subscriptions.userId, endDate: subscriptions.endDate })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, 'active'),
        eq(subscriptions.autoRenew, false),
        gt(subscriptions.endDate, nowSec()),
        lt(subscriptions.endDate, horizon),
      ),
    );

  for (const sub of due) {
    await notify({
      userId: sub.userId,
      type: 'subscription_expiring',
      title: 'Your membership ends soon',
      body: 'Renew now to keep unlimited access without a break.',
      href: '/premium',
    });
  }

  return due.length;
}

export async function adminListSubscriptions(options: {
  page?: number;
  pageSize?: number;
  status?: string;
}) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 30;
  const where = options.status ? eq(subscriptions.status, options.status) : undefined;

  const [items, totals] = await Promise.all([
    db
      .select({
        id: subscriptions.id,
        userId: subscriptions.userId,
        userEmail: users.email,
        userName: users.name,
        planName: plans.name,
        planCode: plans.code,
        status: subscriptions.status,
        startDate: subscriptions.startDate,
        endDate: subscriptions.endDate,
        autoRenew: subscriptions.autoRenew,
        createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .leftJoin(users, eq(users.id, subscriptions.userId))
      .where(where)
      .orderBy(desc(subscriptions.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(subscriptions).where(where),
  ]);

  return { items, total: totals[0]?.value ?? 0, page, pageSize };
}

export async function activeSubscriberCount(): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(subscriptions)
    .where(eq(subscriptions.status, 'active'));
  return rows[0]?.value ?? 0;
}
