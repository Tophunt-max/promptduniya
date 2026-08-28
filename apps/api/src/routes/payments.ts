import { Hono } from 'hono';

import { couponCheckSchema, createOrderSchema, formatMoney, verifyPaymentSchema } from '@pd/shared';
import { z } from 'zod';

import { AppError } from '../lib/errors';
import { limit, requireUser, withAccess, type Vars } from '../middleware';
import { evaluateCoupon } from '../services/coupons';
import { createCheckoutIntent, listUserPayments, verifyCheckout } from '../services/payments';
import { MockProvider, paymentProvider } from '../services/payments/provider';
import { requirePurchasablePlan } from '../services/plans';
import { cancelSubscription, currentSubscription, subscriptionHistory } from '../services/subscriptions';

/**
 * Authenticated payment endpoints. The webhook is mounted separately in
 * index.ts (no auth — authenticity comes from the signature).
 */
const pay = new Hono<{ Bindings: Record<string, unknown>; Variables: Vars }>();
pay.use('*', withAccess);

pay.post('/order', async (c) => {
  await limit(c, 'payment');
  const claims = requireUser(c);
  const body = createOrderSchema.parse(await c.req.json());
  const intent = await createCheckoutIntent({ userId: claims.sub, planCode: body.planCode, couponCode: body.couponCode });
  return c.json(
    {
      ok: true,
      data: {
        orderId: intent.orderId,
        amountMinor: intent.amountMinor,
        currency: intent.currency,
        planCode: intent.planCode,
        planName: intent.planName,
        keyId: intent.keyId,
        isMock: intent.isMock,
        discountMinor: intent.discountMinor,
        couponCode: intent.couponCode,
        receipt: intent.receipt,
        prefill: { name: claims.name, email: claims.email },
      },
    },
    201,
  );
});

pay.post('/verify', async (c) => {
  await limit(c, 'payment');
  const claims = requireUser(c);
  const body = verifyPaymentSchema.parse(await c.req.json());
  const result = await verifyCheckout({
    userId: claims.sub,
    orderId: body.razorpay_order_id,
    paymentId: body.razorpay_payment_id,
    signature: body.razorpay_signature,
  });
  return c.json({ ok: true, data: result });
});

/** Local/CI simulator — refuses when a live gateway is configured. */
pay.post('/mock-complete', async (c) => {
  await limit(c, 'payment');
  const claims = requireUser(c);
  const provider = paymentProvider();
  if (!(provider instanceof MockProvider)) {
    throw AppError.forbidden('Checkout simulation is disabled when a live payment gateway is configured');
  }
  const body = z.object({ orderId: z.string().min(4).max(120) }).parse(await c.req.json());
  const handler = await provider.simulateSuccess(body.orderId);
  const result = await verifyCheckout({
    userId: claims.sub,
    orderId: handler.razorpay_order_id,
    paymentId: handler.razorpay_payment_id,
    signature: handler.razorpay_signature,
  });
  return c.json({ ok: true, data: result });
});

pay.post('/coupon', async (c) => {
  await limit(c, 'coupon');
  const claims = requireUser(c);
  const body = couponCheckSchema.parse(await c.req.json());
  const plan = await requirePurchasablePlan(body.planCode);
  const evaluation = await evaluateCoupon({ code: body.code, plan, userId: claims.sub });
  return c.json({
    ok: true,
    data: {
      code: evaluation.code,
      discountMinor: evaluation.discountMinor,
      discountLabel: evaluation.discountLabel,
      finalAmountMinor: evaluation.finalAmountMinor,
      finalAmountLabel: formatMoney(evaluation.finalAmountMinor, plan.currency),
      originalAmountLabel: formatMoney(plan.priceMinor, plan.currency),
    },
  });
});

pay.get('/history', async (c) => {
  const claims = requireUser(c);
  return c.json({ ok: true, data: { items: await listUserPayments(claims.sub) } });
});

/* ------------------------------ Subscriptions ------------------------------ */

pay.get('/subscription', async (c) => {
  const claims = requireUser(c);
  const [current, history] = await Promise.all([
    currentSubscription(claims.sub),
    subscriptionHistory(claims.sub),
  ]);
  return c.json({ ok: true, data: { current, history } });
});

pay.post('/subscription/cancel', async (c) => {
  await limit(c, 'payment');
  const claims = requireUser(c);
  const sub = await currentSubscription(claims.sub);
  if (!sub) throw AppError.notFound('You do not have an active membership');
  const result = await cancelSubscription(claims.sub, sub.id);
  return c.json({ ok: true, data: { cancelled: true, accessUntil: result.accessUntil } });
});

export default pay;
