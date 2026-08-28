import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { call, migrateTestDb, truncateAll } from './helpers';

/**
 * Payment security over HTTP. Mirrors the monolith's guarantees:
 *   - the server, not the client, decides the amount
 *   - a forged signature never grants access
 *   - the mock-complete path runs the real verify + capture
 */

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await truncateAll();
  // A purchasable monthly plan (₹99) with unlimited limits.
  await env.DB.exec(
    "INSERT INTO plans (id, code, name, price_minor, currency, billing_period, features_json, limits_json, is_active) " +
      "VALUES ('pl_month', 'monthly', 'Monthly', 9900, 'INR', 'month', '[\"Unlimited\"]', '{\"copiesPerDay\":-1,\"favorites\":-1,\"generatorPerDay\":-1}', 1)",
  );
});

async function token(email: string): Promise<string> {
  const res = await call('/v1/auth/register', {
    method: 'POST',
    body: { name: 'Payer', email, password: 'CorrectHorse7!', acceptTerms: true },
  });
  return (res.json.data as { accessToken: string }).accessToken;
}

describe('checkout order', () => {
  it('derives the amount from the plan, ignoring anything the client sends', async () => {
    const t = await token('order@example.com');
    const res = await call('/v1/payments/order', {
      method: 'POST',
      token: t,
      // Client tries to pay ₹0.01 — must be ignored.
      body: { planCode: 'monthly', amountMinor: 1 },
    });
    expect(res.status).toBe(201);
    const data = res.json.data as { amountMinor: number; isMock: boolean };
    expect(data.amountMinor).toBe(9900);
    expect(data.isMock).toBe(true);
  });

  it('rejects the free plan and unknown plans', async () => {
    const t = await token('order2@example.com');
    const unknown = await call('/v1/payments/order', { method: 'POST', token: t, body: { planCode: 'nope' } });
    expect(unknown.status).toBe(404);
  });

  it('requires authentication', async () => {
    const res = await call('/v1/payments/order', { method: 'POST', body: { planCode: 'monthly' } });
    expect(res.status).toBe(401);
  });
});

describe('verify + mock-complete', () => {
  it('activates premium through the real verify path', async () => {
    const t = await token('activate@example.com');
    const order = await call('/v1/payments/order', { method: 'POST', token: t, body: { planCode: 'monthly' } });
    const orderId = (order.json.data as { orderId: string }).orderId;

    const done = await call('/v1/payments/mock-complete', { method: 'POST', token: t, body: { orderId } });
    expect(done.status).toBe(200);
    expect((done.json.data as { status: string }).status).toBe('activated');

    // /me should now report premium.
    const me = await call('/v1/auth/me', { token: t });
    expect((me.json.data as { access: { isPremium: boolean } }).access.isPremium).toBe(true);
  });

  it('rejects a forged checkout signature and never grants access', async () => {
    const t = await token('forge@example.com');
    const order = await call('/v1/payments/order', { method: 'POST', token: t, body: { planCode: 'monthly' } });
    const orderId = (order.json.data as { orderId: string }).orderId;

    const res = await call('/v1/payments/verify', {
      method: 'POST',
      token: t,
      body: {
        razorpay_order_id: orderId,
        razorpay_payment_id: 'pay_fake',
        razorpay_signature: 'a'.repeat(64),
      },
    });
    expect(res.status).toBe(400);
    expect(res.json.error?.code).toBe('payment_failed');

    const me = await call('/v1/auth/me', { token: t });
    expect((me.json.data as { access: { isPremium: boolean } }).access.isPremium).toBe(false);
  });

  it('is idempotent: completing twice keeps a single subscription', async () => {
    const t = await token('idem@example.com');
    const order = await call('/v1/payments/order', { method: 'POST', token: t, body: { planCode: 'monthly' } });
    const orderId = (order.json.data as { orderId: string }).orderId;

    await call('/v1/payments/mock-complete', { method: 'POST', token: t, body: { orderId } });
    await call('/v1/payments/mock-complete', { method: 'POST', token: t, body: { orderId } });

    const subs = await env.DB.prepare('select count(*) as n from subscriptions where status = ?')
      .bind('active')
      .first<{ n: number }>();
    expect(subs?.n).toBe(1);

    const txns = await env.DB.prepare('select count(*) as n from transactions where kind = ?')
      .bind('charge')
      .first<{ n: number }>();
    expect(txns?.n).toBe(1);
  });
});

describe('webhook', () => {
  it('rejects an unsigned webhook', async () => {
    const res = await call('/v1/webhooks/razorpay', { method: 'POST', body: { event: 'payment.captured' } });
    expect(res.status).toBe(403);
  });
});
