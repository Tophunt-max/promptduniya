import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  paymentEvents,
  payments,
  subscriptions,
  transactions,
  users,
} from '@/db/schema';
import { AppError } from '@/lib/api';
import { SETTING_KEYS } from '@/lib/constants';
import { addMonths, addYears, formatDate, nowSec } from '@/lib/dates';
import { newId, newReference } from '@/lib/id';
import { formatMoney } from '@/lib/utils';
import { trackEvent } from '../analytics';
import { evaluateCoupon, redeemCoupon } from '../coupons';
import { activatePremium, deactivatePremium } from '../entitlements';
import { sendSubscriptionActivatedEmail } from '../mailer';
import { notify } from '../notifications';
import { requirePurchasablePlan, type PlanView } from '../plans';
import { getBoolSetting } from '../settings';
import { paymentProvider } from './provider';

/**
 * Payment orchestration.
 *
 * Security invariants enforced here:
 *  1. The amount charged is always derived from the plan row in the database.
 *  2. Premium is never activated from a browser "success" callback alone — the
 *     handler signature is verified with HMAC and the payment status is
 *     re-fetched from the provider before any entitlement is granted.
 *  3. Webhook processing is idempotent: `payment_events.event_key` is unique, so
 *     a redelivered event can never create a second transaction.
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

function periodEnd(plan: PlanView, from: number): number | null {
  switch (plan.billingPeriod) {
    case 'month':
      return addMonths(from, plan.intervalCount);
    case 'year':
      return addYears(from, plan.intervalCount);
    case 'lifetime':
      return null; // no expiry
    default:
      return null;
  }
}

/** Step 1: server creates the order. Nothing about price comes from the client. */
export async function createCheckoutIntent(input: {
  userId: string;
  planCode: string;
  couponCode?: string;
}): Promise<CheckoutIntent> {
  const paymentsEnabled = await getBoolSetting(SETTING_KEYS.paymentsEnabled, true);
  if (!paymentsEnabled) {
    throw AppError.badRequest('Payments are temporarily unavailable. Please try again later.');
  }

  const plan = await requirePurchasablePlan(input.planCode);

  let discountMinor = 0;
  let couponId: string | null = null;
  let couponCode: string | null = null;

  if (input.couponCode) {
    const evaluation = await evaluateCoupon({
      code: input.couponCode,
      plan,
      userId: input.userId,
    });
    discountMinor = evaluation.discountMinor;
    couponId = evaluation.couponId;
    couponCode = evaluation.code;
  }

  const amountMinor = plan.priceMinor - discountMinor;
  if (amountMinor < 100) {
    throw AppError.badRequest('The payable amount is too small to process');
  }

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

  await trackEvent({
    name: 'checkout.started',
    userId: input.userId,
    props: { planCode: plan.code, amountMinor },
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

/**
 * Step 2: verify the checkout handler payload.
 *
 * Signature verification alone is not enough for us: we also re-fetch the
 * payment from the provider and compare its amount and status against our own
 * record before granting anything.
 */
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

  const signatureValid = provider.verifyCheckoutSignature({
    orderId: input.orderId,
    paymentId: input.paymentId,
    signature: input.signature,
  });

  if (!signatureValid) {
    await markPaymentFailed(payment.id, 'Signature verification failed');
    throw new AppError('payment_failed', 'Payment could not be verified', 400);
  }

  // Cross-check with the provider — the browser is not the source of truth.
  const remote = await provider.fetchPayment(input.paymentId);
  if (remote) {
    if (remote.amountMinor !== payment.amountMinor) {
      await markPaymentFailed(payment.id, 'Amount mismatch against provider record');
      throw new AppError('payment_failed', 'Payment amount mismatch. Nothing was charged.', 400);
    }
    if (!['captured', 'authorized'].includes(remote.status)) {
      await db
        .update(payments)
        .set({
          providerPaymentId: input.paymentId,
          providerSignature: input.signature,
          status: 'created',
          paymentMethod: remote.method,
          updatedAt: nowSec(),
        })
        .where(eq(payments.id, payment.id));

      return {
        status: 'pending',
        planName: '',
        subscriptionId: null,
        endsAt: null,
        message: 'Your payment is still being confirmed. We will email you once it completes.',
      };
    }
  }

  const activation = await capturePayment({
    paymentRowId: payment.id,
    providerPaymentId: input.paymentId,
    signature: input.signature,
    method: remote?.method ?? null,
    source: 'checkout',
  });

  return activation;
}

async function markPaymentFailed(paymentRowId: string, reason: string): Promise<void> {
  await db
    .update(payments)
    .set({ status: 'failed', failureReason: reason.slice(0, 300), updatedAt: nowSec() })
    .where(eq(payments.id, paymentRowId));

  const rows = await db
    .select({ userId: payments.userId, amountMinor: payments.amountMinor, currency: payments.currency })
    .from(payments)
    .where(eq(payments.id, paymentRowId))
    .limit(1);

  const row = rows[0];
  if (row) {
    await notify({
      userId: row.userId,
      type: 'payment_failed',
      title: 'Payment could not be completed',
      body: `We could not process ${formatMoney(row.amountMinor, row.currency)}. No amount was captured — you can try again any time.`,
      href: '/premium',
      force: true,
    });
    await trackEvent({ name: 'payment.failed', userId: row.userId, props: { reason } });
  }
}

/**
 * Captures a payment and activates the subscription.
 *
 * Idempotent: if the payment row is already `captured` the existing
 * subscription is returned untouched, so a webhook arriving after the
 * checkout callback (or a webhook redelivery) cannot double-extend access.
 */
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

  const plan = payment.planId
    ? await getPlanByIdSafe(payment.planId)
    : null;
  if (!plan) throw AppError.internal('The plan for this payment no longer exists');

  // Already processed → return the current state without re-granting anything.
  if (payment.status === 'captured') {
    const existing = payment.subscriptionId
      ? await getSubscriptionById(payment.subscriptionId)
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
    providerSubscriptionId: null,
    status: 'active',
    startDate: start,
    endDate: end,
    autoRenew: plan.billingPeriod === 'month' || plan.billingPeriod === 'year',
    couponId: payment.couponId,
  });

  // Retire any earlier active subscription for this user.
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

  // Ledger write guarded by a unique idempotency key.
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

  await notify({
    userId: payment.userId,
    type: 'payment_success',
    title: 'Payment successful',
    body: `${formatMoney(payment.amountMinor, payment.currency)} received. Your ${plan.name} membership is active.`,
    href: '/dashboard/billing',
    force: true,
  });

  await notify({
    userId: payment.userId,
    type: 'subscription_activated',
    title: `${plan.name} membership activated`,
    body: end
      ? `You have premium access until ${formatDate(end)}.`
      : 'You have lifetime premium access. Enjoy!',
    href: '/dashboard',
  });

  const userRows = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, payment.userId))
    .limit(1);

  if (userRows[0]) {
    await sendSubscriptionActivatedEmail(
      userRows[0].email,
      userRows[0].name,
      plan.name,
      end ? formatDate(end) : '',
    );
  }

  await trackEvent({
    name: 'payment.captured',
    userId: payment.userId,
    props: { planCode: plan.code, amountMinor: payment.amountMinor, source: input.source },
  });

  return {
    status: 'activated',
    planName: plan.name,
    subscriptionId,
    endsAt: end,
    message: end
      ? `Your ${plan.name} membership is active until ${formatDate(end)}.`
      : `Your ${plan.name} membership is active for life.`,
  };
}

async function getPlanByIdSafe(planId: string): Promise<PlanView | null> {
  const { getPlanById } = await import('../plans');
  return getPlanById(planId);
}

async function getSubscriptionById(id: string) {
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
  return rows[0] ?? null;
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
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        status?: string;
        method?: string;
        error_description?: string;
      };
    };
    refund?: { entity?: { id?: string; payment_id?: string; amount?: number } };
    subscription?: { entity?: { id?: string; status?: string } };
  };
}

/**
 * Processes a provider webhook.
 *
 * The raw body string must be passed exactly as received — the signature is
 * computed over the bytes, so any re-serialisation would break verification.
 */
export async function processWebhook(input: {
  rawBody: string;
  signature: string | null;
  /** Razorpay's `x-razorpay-event-id`, used as the idempotency key. */
  deliveryId: string | null;
}): Promise<WebhookOutcome> {
  const provider = paymentProvider();

  const signatureValid =
    Boolean(input.signature) && provider.verifyWebhookSignature(input.rawBody, input.signature!);

  if (!signatureValid) {
    // Log the rejected delivery for forensics, then refuse it.
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
  const paymentEntity = body.payload?.payment?.entity;
  const eventKey =
    input.deliveryId ??
    `${eventType}:${paymentEntity?.id ?? body.payload?.refund?.entity?.id ?? 'unknown'}`;

  // Idempotency gate: the unique index makes a redelivery a no-op insert.
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
    return {
      handled: true,
      duplicate: true,
      eventType,
      message: 'Event already processed',
    };
  }

  const eventRowId = inserted[0]!.id;

  try {
    const message = await applyWebhookEvent(eventType, body);
    await db
      .update(paymentEvents)
      .set({ processedAt: nowSec() })
      .where(eq(paymentEvents.id, eventRowId));
    return { handled: true, duplicate: false, eventType, message };
  } catch (error) {
    const description = error instanceof Error ? error.message : 'Unknown processing error';
    await db
      .update(paymentEvents)
      .set({ processedAt: nowSec(), processingError: description.slice(0, 500) })
      .where(eq(paymentEvents.id, eventRowId));
    throw error;
  }
}

async function applyWebhookEvent(
  eventType: string,
  body: RazorpayWebhookBody,
): Promise<string> {
  const paymentEntity = body.payload?.payment?.entity;

  switch (eventType) {
    case 'payment.captured':
    case 'payment.authorized': {
      if (!paymentEntity?.order_id || !paymentEntity.id) return 'Nothing to do';

      const rows = await db
        .select()
        .from(payments)
        .where(eq(payments.providerOrderId, paymentEntity.order_id))
        .limit(1);

      const payment = rows[0];
      if (!payment) return 'No matching order';

      if (paymentEntity.amount !== undefined && paymentEntity.amount !== payment.amountMinor) {
        await markPaymentFailed(payment.id, 'Webhook amount mismatch');
        return 'Amount mismatch — payment marked failed';
      }

      await capturePayment({
        paymentRowId: payment.id,
        providerPaymentId: paymentEntity.id,
        method: paymentEntity.method ?? null,
        source: 'webhook',
      });
      return 'Subscription activated';
    }

    case 'payment.failed': {
      if (!paymentEntity?.order_id) return 'Nothing to do';
      const rows = await db
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.providerOrderId, paymentEntity.order_id))
        .limit(1);
      if (!rows[0]) return 'No matching order';
      await markPaymentFailed(
        rows[0].id,
        paymentEntity.error_description ?? 'Payment failed at the provider',
      );
      return 'Payment marked failed';
    }

    case 'refund.created':
    case 'refund.processed': {
      const refund = body.payload?.refund?.entity;
      if (!refund?.payment_id) return 'Nothing to do';
      return handleRefund(refund.payment_id, refund.amount ?? 0, refund.id ?? newId());
    }

    case 'subscription.cancelled':
    case 'subscription.halted': {
      const sub = body.payload?.subscription?.entity;
      if (!sub?.id) return 'Nothing to do';
      return cancelByProviderSubscriptionId(sub.id);
    }

    default:
      return `Event ${eventType} acknowledged, no action required`;
  }
}

async function handleRefund(
  providerPaymentId: string,
  amountMinor: number,
  refundId: string,
): Promise<string> {
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.providerPaymentId, providerPaymentId))
    .limit(1);

  const payment = rows[0];
  if (!payment) return 'No matching payment';

  const refunded = payment.refundedMinor + amountMinor;
  const fullyRefunded = refunded >= payment.amountMinor;

  await db
    .update(payments)
    .set({
      refundedMinor: refunded,
      status: fullyRefunded ? 'refunded' : 'partially_refunded',
      updatedAt: nowSec(),
    })
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

  if (fullyRefunded && payment.subscriptionId) {
    await db
      .update(subscriptions)
      .set({ status: 'cancelled', cancelledAt: nowSec(), autoRenew: false, updatedAt: nowSec() })
      .where(eq(subscriptions.id, payment.subscriptionId));
    await deactivatePremium(payment.userId);
  }

  await notify({
    userId: payment.userId,
    type: 'payment_success',
    title: fullyRefunded ? 'Refund processed' : 'Partial refund processed',
    body: `${formatMoney(Math.abs(amountMinor), payment.currency)} has been refunded to your original payment method.`,
    href: '/dashboard/billing',
    force: true,
  });

  return fullyRefunded ? 'Fully refunded, access revoked' : 'Partial refund recorded';
}

async function cancelByProviderSubscriptionId(providerSubscriptionId: string): Promise<string> {
  const rows = await db
    .select({ id: subscriptions.id, userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.providerSubscriptionId, providerSubscriptionId))
    .limit(1);

  const sub = rows[0];
  if (!sub) return 'No matching subscription';

  await db
    .update(subscriptions)
    .set({ status: 'cancelled', cancelledAt: nowSec(), autoRenew: false, updatedAt: nowSec() })
    .where(eq(subscriptions.id, sub.id));

  await notify({
    userId: sub.userId,
    type: 'subscription_expired',
    title: 'Membership cancelled',
    body: 'Your premium membership has been cancelled. You can resubscribe any time.',
    href: '/premium',
    force: true,
  });

  return 'Subscription cancelled';
}

/* --------------------------------- Read APIs -------------------------------- */

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
      providerPaymentId: payments.providerPaymentId,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.createdAt))
    .limit(limit);
}

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

export { paymentProvider } from './provider';
export type { PaymentProvider } from './provider';
