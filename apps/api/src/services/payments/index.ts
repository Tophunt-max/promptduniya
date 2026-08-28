import { db, paymentEvents, payments, subscriptions, transactions, users } from '@pd/db';
import { SETTING_KEYS } from '@pd/shared';
import { and, desc, eq, sql } from 'drizzle-orm';

import { AppError } from '../../lib/errors';
import { nowSec } from '../../lib/dates';
import { newId, newReference } from '../../lib/crypto';
import { evaluateCoupon, redeemCoupon } from '../coupons';
import { activatePremium, deactivatePremium } from '../entitlements';
import { getPlanById, periodEnd, requirePurchasablePlan } from '../plans';
import { getBoolSetting } from '../settings';
import { paymentProvider } from './provider';

/**
 * Payment orchestration. Security invariants (all mirrored from the monolith
 * and covered by tests):
 *   1. amount derived from the plan row, never the client
 *   2. checkout signature verified, then payment re-fetched and amount compared
 *   3. webhook processing idempotent via unique (provider, event_key)
 */

export interface CheckoutIntent {
  orderId: string;
  amountMinor: number;
  currency: string;
  planCode: string;
  planName: string;
  paymentId: string;
  keyId: string;
  isMock: boolean;
  discountMinor: number;
  couponCode: string | null;
  receipt: string;
}

export async function createCheckoutIntent(input: {
  userId: string;
  planCode: string;
  couponCode?: string;
}): Promise<CheckoutIntent> {
  if (!(await getBoolSetting(SETTING_KEYS.paymentsEnabled, true))) {
    throw AppError.badRequest('Payments are temporarily unavailable. Please try again later.');
  }

  const plan = await requirePurchasablePlan(input.planCode);

  let discountMinor = 0;
  let couponId: string | null = null;
  let couponCode: string | null = null;
  if (input.couponCode) {
    const evaluation = await evaluateCoupon({ code: input.couponCode, plan, userId: input.userId });
    discountMinor = evaluation.discountMinor;
    couponId = evaluation.couponId;
    couponCode = evaluation.code;
  }

  const amountMinor = plan.priceMinor - discountMinor;
  if (amountMinor < 100) throw AppError.badRequest('The payable amount is too small to process');

  const provider = paymentProvider();
  const receipt = newReference('PD');
  const order = await provider.createOrder({
    amountMinor,
    currency: plan.currency,
    receipt,
    notes: { planCode: plan.code, userId: input.userId },
  });

  const paymentId = newId();
  await db.insert(payments).values({
    id: paymentId,
    userId: input.userId,
    planId: plan.id,
    amountMinor,
    discountMinor,
    currency: plan.currency,
    provider: provider.name,
    providerOrderId: order.id,
    status: 'created',
    couponId,
    receiptId: receipt,
  });

  return {
    orderId: order.id,
    amountMinor,
    currency: plan.currency,
    planCode: plan.code,
    planName: plan.name,
    paymentId,
    keyId: provider.publicKeyId(),
    isMock: provider.isMock,
    discountMinor,
    couponCode,
    receipt,
  };
}

export interface VerificationResult {
  status: 'activated' | 'pending' | 'failed';
  planName: string;
  subscriptionId: string | null;
  endsAt: number | null;
  message: string;
}

export async function verifyCheckout(input: {
  userId: string;
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<VerificationResult> {
  const provider = paymentProvider();
  const rows = await db
    .select()
    .from(payments)
    .where(and(eq(payments.providerOrderId, input.orderId), eq(payments.userId, input.userId)))
    .limit(1);
  const payment = rows[0];
  if (!payment) throw AppError.notFound('We could not find that order');

  const signatureOk = provider.verifyCheckoutSignature({
    orderId: input.orderId,
    paymentId: input.paymentId,
    signature: input.signature,
  });
  if (!signatureOk) {
    await markFailed(payment.id, 'Signature verification failed');
    throw AppError.paymentFailed('Payment could not be verified');
  }

  const remote = await provider.fetchPayment(input.paymentId);
  if (remote) {
    if (remote.amountMinor !== payment.amountMinor) {
      await markFailed(payment.id, 'Amount mismatch against provider record');
      throw AppError.paymentFailed('Payment amount mismatch. Nothing was charged.');
    }
    if (!['captured', 'authorized'].includes(remote.status)) {
      await db
        .update(payments)
        .set({ providerPaymentId: input.paymentId, providerSignature: input.signature, paymentMethod: remote.method, updatedAt: nowSec() })
        .where(eq(payments.id, payment.id));
      return { status: 'pending', planName: '', subscriptionId: null, endsAt: null, message: 'Your payment is still being confirmed.' };
    }
  }

  return capturePayment({
    paymentRowId: payment.id,
    providerPaymentId: input.paymentId,
    signature: input.signature,
    method: remote?.method ?? null,
    source: 'checkout',
  });
}

async function markFailed(paymentRowId: string, reason: string): Promise<void> {
  await db
    .update(payments)
    .set({ status: 'failed', failureReason: reason.slice(0, 300), updatedAt: nowSec() })
    .where(eq(payments.id, paymentRowId));
}

/** Idempotent capture — a re-run returns the existing subscription untouched. */
async function capturePayment(input: {
  paymentRowId: string;
  providerPaymentId: string;
  signature?: string | null;
  method?: string | null;
  source: 'checkout' | 'webhook';
}): Promise<VerificationResult> {
  const rows = await db.select().from(payments).where(eq(payments.id, input.paymentRowId)).limit(1);
  const payment = rows[0];
  if (!payment) throw AppError.notFound('Payment record not found');

  const plan = payment.planId ? await getPlanById(payment.planId) : null;
  if (!plan) throw AppError.internal('The plan for this payment no longer exists');

  if (payment.status === 'captured') {
    const existing = payment.subscriptionId
      ? (await db.select().from(subscriptions).where(eq(subscriptions.id, payment.subscriptionId)).limit(1))[0]
      : null;
    return {
      status: 'activated',
      planName: plan.name,
      subscriptionId: existing?.id ?? null,
      endsAt: existing?.endDate ?? null,
      message: 'This payment was already confirmed.',
    };
  }

  const start = nowSec();
  const end = periodEnd(plan, start);
  const subscriptionId = newId();

  await db.insert(subscriptions).values({
    id: subscriptionId,
    userId: payment.userId,
    planId: plan.id,
    provider: payment.provider,
    status: 'active',
    startDate: start,
    endDate: end,
    autoRenew: plan.billingPeriod === 'month' || plan.billingPeriod === 'year',
    couponId: payment.couponId,
  });

  await db
    .update(subscriptions)
    .set({ status: 'expired', updatedAt: nowSec() })
    .where(
      and(
        eq(subscriptions.userId, payment.userId),
        eq(subscriptions.status, 'active'),
        sql`${subscriptions.id} <> ${subscriptionId}`,
      ),
    );

  await db
    .update(payments)
    .set({
      status: 'captured',
      providerPaymentId: input.providerPaymentId,
      providerSignature: input.signature ?? null,
      paymentMethod: input.method ?? null,
      subscriptionId,
      updatedAt: nowSec(),
    })
    .where(eq(payments.id, payment.id));

  await db
    .insert(transactions)
    .values({
      id: newId(),
      userId: payment.userId,
      paymentId: payment.id,
      subscriptionId,
      kind: 'charge',
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      idempotencyKey: `charge:${input.providerPaymentId}`,
      description: `${plan.name} membership`,
    })
    .onConflictDoNothing();

  if (payment.couponId) {
    await redeemCoupon({
      couponId: payment.couponId,
      userId: payment.userId,
      paymentId: payment.id,
      discountMinor: payment.discountMinor,
    });
  }

  await activatePremium({ userId: payment.userId, subscriptionId, expiresAt: end });

  return {
    status: 'activated',
    planName: plan.name,
    subscriptionId,
    endsAt: end,
    message: end ? `Your ${plan.name} membership is active.` : `Your ${plan.name} membership is active for life.`,
  };
}

/* --------------------------------- Webhooks -------------------------------- */

export interface WebhookOutcome {
  handled: boolean;
  duplicate: boolean;
  eventType: string;
  message: string;
}

interface RazorpayWebhookBody {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string; method?: string; error_description?: string } };
    refund?: { entity?: { id?: string; payment_id?: string; amount?: number } };
    subscription?: { entity?: { id?: string; status?: string } };
  };
}

export async function processWebhook(input: {
  rawBody: string;
  signature: string | null;
  deliveryId: string | null;
}): Promise<WebhookOutcome> {
  const provider = paymentProvider();
  const signatureValid = Boolean(input.signature) && provider.verifyWebhookSignature(input.rawBody, input.signature!);

  if (!signatureValid) {
    await db
      .insert(paymentEvents)
      .values({
        id: newId(),
        provider: provider.name,
        eventType: 'invalid_signature',
        eventKey: `invalid:${input.deliveryId ?? newId()}`,
        payloadJson: input.rawBody.slice(0, 4000),
        signatureValid: false,
        processingError: 'Signature verification failed',
      })
      .onConflictDoNothing();
    throw AppError.forbidden('Invalid webhook signature');
  }

  let body: RazorpayWebhookBody;
  try {
    body = JSON.parse(input.rawBody) as RazorpayWebhookBody;
  } catch {
    throw AppError.badRequest('Webhook body was not valid JSON');
  }

  const eventType = body.event ?? 'unknown';
  const entity = body.payload?.payment?.entity;
  const eventKey = input.deliveryId ?? `${eventType}:${entity?.id ?? body.payload?.refund?.entity?.id ?? 'unknown'}`;

  const inserted = await db
    .insert(paymentEvents)
    .values({
      id: newId(),
      provider: provider.name,
      eventType,
      eventKey,
      payloadJson: input.rawBody.slice(0, 8000),
      signatureValid: true,
    })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id });

  if (inserted.length === 0) {
    return { handled: true, duplicate: true, eventType, message: 'Event already processed' };
  }

  try {
    const message = await applyEvent(eventType, body);
    await db.update(paymentEvents).set({ processedAt: nowSec() }).where(eq(paymentEvents.id, inserted[0]!.id));
    return { handled: true, duplicate: false, eventType, message };
  } catch (error) {
    const description = error instanceof Error ? error.message : 'Unknown processing error';
    await db
      .update(paymentEvents)
      .set({ processedAt: nowSec(), processingError: description.slice(0, 500) })
      .where(eq(paymentEvents.id, inserted[0]!.id));
    throw error;
  }
}

async function applyEvent(eventType: string, body: RazorpayWebhookBody): Promise<string> {
  const entity = body.payload?.payment?.entity;
  switch (eventType) {
    case 'payment.captured':
    case 'payment.authorized': {
      if (!entity?.order_id || !entity.id) return 'Nothing to do';
      const rows = await db.select().from(payments).where(eq(payments.providerOrderId, entity.order_id)).limit(1);
      const payment = rows[0];
      if (!payment) return 'No matching order';
      if (entity.amount !== undefined && entity.amount !== payment.amountMinor) {
        await markFailed(payment.id, 'Webhook amount mismatch');
        return 'Amount mismatch — payment marked failed';
      }
      await capturePayment({ paymentRowId: payment.id, providerPaymentId: entity.id, method: entity.method ?? null, source: 'webhook' });
      return 'Subscription activated';
    }
    case 'payment.failed': {
      if (!entity?.order_id) return 'Nothing to do';
      const rows = await db.select({ id: payments.id }).from(payments).where(eq(payments.providerOrderId, entity.order_id)).limit(1);
      if (!rows[0]) return 'No matching order';
      await markFailed(rows[0].id, entity.error_description ?? 'Payment failed at the provider');
      return 'Payment marked failed';
    }
    case 'refund.created':
    case 'refund.processed': {
      const refund = body.payload?.refund?.entity;
      if (!refund?.payment_id) return 'Nothing to do';
      return handleRefund(refund.payment_id, refund.amount ?? 0, refund.id ?? newId());
    }
    default:
      return `Event ${eventType} acknowledged, no action required`;
  }
}

async function handleRefund(providerPaymentId: string, amountMinor: number, refundId: string): Promise<string> {
  const rows = await db.select().from(payments).where(eq(payments.providerPaymentId, providerPaymentId)).limit(1);
  const payment = rows[0];
  if (!payment) return 'No matching payment';

  const refunded = payment.refundedMinor + amountMinor;
  const fully = refunded >= payment.amountMinor;
  await db
    .update(payments)
    .set({ refundedMinor: refunded, status: fully ? 'refunded' : 'partially_refunded', updatedAt: nowSec() })
    .where(eq(payments.id, payment.id));

  await db
    .insert(transactions)
    .values({
      id: newId(),
      userId: payment.userId,
      paymentId: payment.id,
      subscriptionId: payment.subscriptionId,
      kind: 'refund',
      amountMinor: -Math.abs(amountMinor),
      currency: payment.currency,
      idempotencyKey: `refund:${refundId}`,
      description: 'Refund',
    })
    .onConflictDoNothing();

  if (fully && payment.subscriptionId) {
    await db
      .update(subscriptions)
      .set({ status: 'cancelled', cancelledAt: nowSec(), autoRenew: false, updatedAt: nowSec() })
      .where(eq(subscriptions.id, payment.subscriptionId));
    await deactivatePremium(payment.userId);
  }
  return fully ? 'Fully refunded, access revoked' : 'Partial refund recorded';
}

export async function listUserPayments(userId: string, limit = 30) {
  return db
    .select({
      id: payments.id,
      amountMinor: payments.amountMinor,
      discountMinor: payments.discountMinor,
      currency: payments.currency,
      status: payments.status,
      method: payments.paymentMethod,
      receiptId: payments.receiptId,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.createdAt))
    .limit(limit);
}

export { paymentProvider } from './provider';


/* ============================ Admin reads ============================== */

export async function adminListPayments(options: {
  page?: number;
  pageSize?: number;
  status?: string;
}) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 30;
  const where = options.status ? eq(payments.status, options.status) : undefined;

  const [items, totals] = await Promise.all([
    db
      .select({
        id: payments.id,
        userId: payments.userId,
        userEmail: users.email,
        userName: users.name,
        amountMinor: payments.amountMinor,
        currency: payments.currency,
        status: payments.status,
        method: payments.paymentMethod,
        providerOrderId: payments.providerOrderId,
        providerPaymentId: payments.providerPaymentId,
        receiptId: payments.receiptId,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .leftJoin(users, eq(users.id, payments.userId))
      .where(where)
      .orderBy(desc(payments.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: sql<number>`count(*)` }).from(payments).where(where),
  ]);

  return { items, total: Number(totals[0]?.value ?? 0), page, pageSize };
}

/** Raw provider webhook log — the audit trail for billing disputes. */
export async function adminListPaymentEvents(limit = 50) {
  return db
    .select({
      id: paymentEvents.id,
      eventType: paymentEvents.eventType,
      eventKey: paymentEvents.eventKey,
      signatureValid: paymentEvents.signatureValid,
      processedAt: paymentEvents.processedAt,
      processingError: paymentEvents.processingError,
      createdAt: paymentEvents.createdAt,
    })
    .from(paymentEvents)
    .orderBy(desc(paymentEvents.createdAt))
    .limit(limit);
}
