import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import { paymentEvents, payments, subscriptions, transactions } from '@/db/schema';
import { AppError } from '@/lib/api';
import { resolveAccess } from '@/services/entitlements';
import {
  createCheckoutIntent,
  processWebhook,
  verifyCheckout,
} from '@/services/payments';
import { MockProvider, setPaymentProvider } from '@/services/payments/provider';
import { resetDatabase, seedRoles, seedTestPlans, createTestUser, countRows } from './helpers';

/**
 * Payment security tests.
 *
 * These cover the four properties that must never regress:
 *   1. the amount is taken from the plan row, not the request
 *   2. a bad signature never grants access
 *   3. webhook processing is idempotent
 *   4. an amount mismatch fails the payment instead of granting access
 */

const SECRET = 'test_mock_secret_key';
let provider: MockProvider;

beforeEach(async () => {
  await resetDatabase();
  await seedRoles();
  await seedTestPlans();

  provider = new MockProvider(SECRET);
  setPaymentProvider(provider);
});

afterEach(() => {
  setPaymentProvider(null);
});

describe('order creation', () => {
  it('derives the amount from the plan, ignoring anything the client sends', async () => {
    const user = await createTestUser();
    const intent = await createCheckoutIntent({ userId: user.id, planCode: 'monthly' });

    // The seeded monthly plan is ₹99 = 9900 paise.
    expect(intent.amountMinor).toBe(9_900);
    expect(intent.currency).toBe('INR');
    expect(intent.planCode).toBe('monthly');

    const rows = await getDb()
      .select()
      .from(payments)
      .where(eq(payments.providerOrderId, intent.orderId));

    expect(rows[0]?.amountMinor).toBe(9_900);
    expect(rows[0]?.status).toBe('created');
  });

  it('refuses to create an order for the free plan', async () => {
    const user = await createTestUser();
    await expect(
      createCheckoutIntent({ userId: user.id, planCode: 'free' }),
    ).rejects.toThrow(/does not require a payment/i);
  });

  it('refuses an unknown plan code', async () => {
    const user = await createTestUser();
    await expect(
      createCheckoutIntent({ userId: user.id, planCode: 'does-not-exist' }),
    ).rejects.toThrow(AppError);
  });

  it('does not grant premium at order creation time', async () => {
    const user = await createTestUser();
    await createCheckoutIntent({ userId: user.id, planCode: 'monthly' });

    const access = await resolveAccess(user.id);
    expect(access.isPremium).toBe(false);
    expect(await countRows('subscriptions')).toBe(0);
  });
});

describe('checkout verification', () => {
  it('activates premium for a correctly signed payment', async () => {
    const user = await createTestUser();
    const intent = await createCheckoutIntent({ userId: user.id, planCode: 'monthly' });
    const handler = await provider.simulateSuccess(intent.orderId, 'upi');

    const result = await verifyCheckout({
      userId: user.id,
      orderId: handler.razorpay_order_id,
      paymentId: handler.razorpay_payment_id,
      signature: handler.razorpay_signature,
    });

    expect(result.status).toBe('activated');
    expect(result.subscriptionId).toBeTruthy();

    const access = await resolveAccess(user.id);
    expect(access.isPremium).toBe(true);
    expect(access.planCode).toBe('monthly');
  });

  it('rejects a forged signature and never grants access', async () => {
    const user = await createTestUser();
    const intent = await createCheckoutIntent({ userId: user.id, planCode: 'monthly' });
    const handler = await provider.simulateSuccess(intent.orderId);

    await expect(
      verifyCheckout({
        userId: user.id,
        orderId: handler.razorpay_order_id,
        paymentId: handler.razorpay_payment_id,
        signature: 'deadbeef'.repeat(8),
      }),
    ).rejects.toThrow(/could not be verified/i);

    const access = await resolveAccess(user.id);
    expect(access.isPremium).toBe(false);

    const rows = await getDb()
      .select()
      .from(payments)
      .where(eq(payments.providerOrderId, intent.orderId));
    expect(rows[0]?.status).toBe('failed');
  });

  it('rejects a signature computed with the wrong secret', async () => {
    const user = await createTestUser();
    const intent = await createCheckoutIntent({ userId: user.id, planCode: 'monthly' });
    const paymentId = 'pay_attacker_generated';

    const forged = createHmac('sha256', 'attacker-secret')
      .update(`${intent.orderId}|${paymentId}`)
      .digest('hex');

    await expect(
      verifyCheckout({
        userId: user.id,
        orderId: intent.orderId,
        paymentId,
        signature: forged,
      }),
    ).rejects.toThrow(/could not be verified/i);

    expect((await resolveAccess(user.id)).isPremium).toBe(false);
  });

  it('refuses to verify another user\u2019s order', async () => {
    const buyer = await createTestUser();
    const attacker = await createTestUser();

    const intent = await createCheckoutIntent({ userId: buyer.id, planCode: 'monthly' });
    const handler = await provider.simulateSuccess(intent.orderId);

    await expect(
      verifyCheckout({
        userId: attacker.id,
        orderId: handler.razorpay_order_id,
        paymentId: handler.razorpay_payment_id,
        signature: handler.razorpay_signature,
      }),
    ).rejects.toThrow(/could not find that order/i);

    expect((await resolveAccess(attacker.id)).isPremium).toBe(false);
  });

  it('is idempotent: verifying twice does not create two subscriptions', async () => {
    const user = await createTestUser();
    const intent = await createCheckoutIntent({ userId: user.id, planCode: 'monthly' });
    const handler = await provider.simulateSuccess(intent.orderId);

    const first = await verifyCheckout({
      userId: user.id,
      orderId: handler.razorpay_order_id,
      paymentId: handler.razorpay_payment_id,
      signature: handler.razorpay_signature,
    });
    const second = await verifyCheckout({
      userId: user.id,
      orderId: handler.razorpay_order_id,
      paymentId: handler.razorpay_payment_id,
      signature: handler.razorpay_signature,
    });

    expect(first.status).toBe('activated');
    expect(second.status).toBe('activated');
    expect(await countRows('subscriptions')).toBe(1);
    expect(await countRows('transactions')).toBe(1);
  });

  it('writes exactly one ledger transaction per captured payment', async () => {
    const user = await createTestUser();
    const intent = await createCheckoutIntent({ userId: user.id, planCode: 'monthly' });
    const handler = await provider.simulateSuccess(intent.orderId);

    await verifyCheckout({
      userId: user.id,
      orderId: handler.razorpay_order_id,
      paymentId: handler.razorpay_payment_id,
      signature: handler.razorpay_signature,
    });

    const ledger = await getDb().select().from(transactions);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.kind).toBe('charge');
    expect(ledger[0]?.amountMinor).toBe(9_900);
    expect(ledger[0]?.idempotencyKey).toBe(`charge:${handler.razorpay_payment_id}`);
  });
});

describe('webhook processing', () => {
  function signedWebhook(body: unknown) {
    const rawBody = JSON.stringify(body);
    return { rawBody, signature: provider.signWebhook(rawBody) };
  }

  it('rejects a webhook with a missing signature', async () => {
    const { rawBody } = signedWebhook({ event: 'payment.captured' });

    await expect(
      processWebhook({ rawBody, signature: null, deliveryId: 'evt_1' }),
    ).rejects.toThrow(/invalid webhook signature/i);
  });

  it('rejects a webhook with an invalid signature and logs the attempt', async () => {
    const { rawBody } = signedWebhook({ event: 'payment.captured' });

    await expect(
      processWebhook({ rawBody, signature: 'not-a-real-signature', deliveryId: 'evt_2' }),
    ).rejects.toThrow(/invalid webhook signature/i);

    const events = await getDb().select().from(paymentEvents);
    expect(events).toHaveLength(1);
    expect(events[0]?.signatureValid).toBe(false);
    expect(events[0]?.eventType).toBe('invalid_signature');
  });

  it('activates a subscription from a valid payment.captured event', async () => {
    const user = await createTestUser();
    const intent = await createCheckoutIntent({ userId: user.id, planCode: 'monthly' });

    const { rawBody, signature } = signedWebhook({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_webhook_1',
            order_id: intent.orderId,
            amount: 9_900,
            status: 'captured',
            method: 'upi',
          },
        },
      },
    });

    const outcome = await processWebhook({ rawBody, signature, deliveryId: 'evt_capture_1' });

    expect(outcome.handled).toBe(true);
    expect(outcome.duplicate).toBe(false);
    expect((await resolveAccess(user.id)).isPremium).toBe(true);
  });

  it('is idempotent: a redelivered event creates no second transaction', async () => {
    const user = await createTestUser();
    const intent = await createCheckoutIntent({ userId: user.id, planCode: 'monthly' });

    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_webhook_2',
            order_id: intent.orderId,
            amount: 9_900,
            status: 'captured',
            method: 'card',
          },
        },
      },
    };
    const { rawBody, signature } = signedWebhook(payload);

    const first = await processWebhook({ rawBody, signature, deliveryId: 'evt_dupe' });
    const second = await processWebhook({ rawBody, signature, deliveryId: 'evt_dupe' });
    const third = await processWebhook({ rawBody, signature, deliveryId: 'evt_dupe' });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(third.duplicate).toBe(true);

    expect(await countRows('subscriptions')).toBe(1);
    expect(await countRows('transactions')).toBe(1);
    expect(await countRows('payment_events')).toBe(1);
  });

  it('fails the payment when the webhook amount does not match the plan price', async () => {
    const user = await createTestUser();
    const intent = await createCheckoutIntent({ userId: user.id, planCode: 'monthly' });

    const { rawBody, signature } = signedWebhook({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_tampered',
            order_id: intent.orderId,
            // An attacker paying ₹1 for a ₹99 plan.
            amount: 100,
            status: 'captured',
            method: 'upi',
          },
        },
      },
    });

    const outcome = await processWebhook({ rawBody, signature, deliveryId: 'evt_mismatch' });

    expect(outcome.message).toMatch(/mismatch/i);
    expect((await resolveAccess(user.id)).isPremium).toBe(false);

    const rows = await getDb()
      .select()
      .from(payments)
      .where(eq(payments.providerOrderId, intent.orderId));
    expect(rows[0]?.status).toBe('failed');
  });

  it('marks the payment failed on a payment.failed event', async () => {
    const user = await createTestUser();
    const intent = await createCheckoutIntent({ userId: user.id, planCode: 'monthly' });

    const { rawBody, signature } = signedWebhook({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_failed',
            order_id: intent.orderId,
            status: 'failed',
            error_description: 'Insufficient funds',
          },
        },
      },
    });

    await processWebhook({ rawBody, signature, deliveryId: 'evt_failed' });

    const rows = await getDb()
      .select()
      .from(payments)
      .where(eq(payments.providerOrderId, intent.orderId));

    expect(rows[0]?.status).toBe('failed');
    expect(rows[0]?.failureReason).toMatch(/insufficient funds/i);
    expect((await resolveAccess(user.id)).isPremium).toBe(false);
  });

  it('revokes access and records a refund on a full refund event', async () => {
    const user = await createTestUser();
    const intent = await createCheckoutIntent({ userId: user.id, planCode: 'monthly' });
    const handler = await provider.simulateSuccess(intent.orderId);

    await verifyCheckout({
      userId: user.id,
      orderId: handler.razorpay_order_id,
      paymentId: handler.razorpay_payment_id,
      signature: handler.razorpay_signature,
    });
    expect((await resolveAccess(user.id)).isPremium).toBe(true);

    const { rawBody, signature } = signedWebhook({
      event: 'refund.processed',
      payload: {
        refund: {
          entity: {
            id: 'rfnd_1',
            payment_id: handler.razorpay_payment_id,
            amount: 9_900,
          },
        },
      },
    });

    await processWebhook({ rawBody, signature, deliveryId: 'evt_refund' });

    const paymentRows = await getDb()
      .select()
      .from(payments)
      .where(eq(payments.providerPaymentId, handler.razorpay_payment_id));
    expect(paymentRows[0]?.status).toBe('refunded');

    const subscriptionRows = await getDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, user.id));
    expect(subscriptionRows[0]?.status).toBe('cancelled');

    expect((await resolveAccess(user.id)).isPremium).toBe(false);

    const ledger = await getDb().select().from(transactions);
    expect(ledger.some((row) => row.kind === 'refund' && row.amountMinor === -9_900)).toBe(true);
  });

  it('acknowledges unrelated events without side effects', async () => {
    const { rawBody, signature } = signedWebhook({ event: 'order.paid', payload: {} });

    const outcome = await processWebhook({ rawBody, signature, deliveryId: 'evt_other' });

    expect(outcome.handled).toBe(true);
    expect(outcome.message).toMatch(/acknowledged/i);
    expect(await countRows('subscriptions')).toBe(0);
  });

  it('rejects a body that was re-serialised after signing', async () => {
    // Signing the pretty-printed form then sending the compact form must fail —
    // this is why the route reads the raw body rather than re-stringifying JSON.
    const payload = { event: 'payment.captured', payload: {} };
    const signature = provider.signWebhook(JSON.stringify(payload, null, 2));

    await expect(
      processWebhook({ rawBody: JSON.stringify(payload), signature, deliveryId: 'evt_reserialised' }),
    ).rejects.toThrow(/invalid webhook signature/i);
  });
});
