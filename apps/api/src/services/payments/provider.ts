import { createHmac } from 'node:crypto';

import { useKv } from '@pd/db';
import { config, razorpayConfigured } from '../../lib/env';
import { safeEqual, newReference } from '../../lib/crypto';

/**
 * Payment provider adapter.
 *
 * `RazorpayProvider` talks to the live REST API over fetch (works on Workers).
 * `MockProvider` implements the same interface with **real HMAC signatures**,
 * persisting order/payment state in KV so the full order → verify → webhook
 * flow works across requests without credentials. Never bypasses verification.
 */

export interface ProviderOrder {
  id: string;
  amountMinor: number;
  currency: string;
  receipt: string;
  status: string;
}

export interface ProviderPayment {
  id: string;
  orderId: string | null;
  amountMinor: number;
  currency: string;
  status: string;
  method: string | null;
}

export interface PaymentProvider {
  readonly name: string;
  readonly isMock: boolean;
  publicKeyId(): string;
  createOrder(input: { amountMinor: number; currency: string; receipt: string; notes?: Record<string, string> }): Promise<ProviderOrder>;
  fetchPayment(paymentId: string): Promise<ProviderPayment | null>;
  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

const RAZORPAY_API = 'https://api.razorpay.com/v1';

class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay';
  readonly isMock = false;
  constructor(private readonly keyId: string, private readonly keySecret: string, private readonly webhookSecret: string) {}

  publicKeyId() {
    return this.keyId;
  }

  private auth() {
    return `Basic ${btoa(`${this.keyId}:${this.keySecret}`)}`;
  }

  async createOrder(input: { amountMinor: number; currency: string; receipt: string; notes?: Record<string, string> }): Promise<ProviderOrder> {
    const res = await fetch(`${RAZORPAY_API}/orders`, {
      method: 'POST',
      headers: { authorization: this.auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        amount: input.amountMinor,
        currency: input.currency,
        receipt: input.receipt,
        payment_capture: 1,
        notes: input.notes ?? {},
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Razorpay ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { id: string; amount: number; currency: string; receipt: string; status: string };
    return { id: body.id, amountMinor: body.amount, currency: body.currency, receipt: body.receipt, status: body.status };
  }

  async fetchPayment(paymentId: string): Promise<ProviderPayment | null> {
    try {
      const res = await fetch(`${RAZORPAY_API}/payments/${encodeURIComponent(paymentId)}`, {
        headers: { authorization: this.auth() },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { id: string; order_id: string | null; amount: number; currency: string; status: string; method: string | null };
      return { id: body.id, orderId: body.order_id, amountMinor: body.amount, currency: body.currency, status: body.status, method: body.method };
    } catch {
      return null;
    }
  }

  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean {
    const expected = createHmac('sha256', this.keySecret).update(`${input.orderId}|${input.paymentId}`).digest('hex');
    return safeEqual(expected, input.signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!this.webhookSecret) return false;
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return safeEqual(expected, signature);
  }
}

/** KV-backed simulator. Genuinely signs, so verification is truly exercised. */
export class MockProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly isMock = true;
  constructor(private readonly secret: string) {}

  publicKeyId() {
    return 'rzp_test_mock0000000000';
  }

  private orderKey(id: string) {
    return `mockpay:order:${id}`;
  }
  private payKey(id: string) {
    return `mockpay:payment:${id}`;
  }

  async createOrder(input: { amountMinor: number; currency: string; receipt: string }): Promise<ProviderOrder> {
    const order: ProviderOrder = {
      id: `order_mock_${newReference('').replace(/[^A-Z0-9]/g, '')}${Date.now().toString(36)}`,
      amountMinor: input.amountMinor,
      currency: input.currency,
      receipt: input.receipt,
      status: 'created',
    };
    await useKv().cache.put(this.orderKey(order.id), JSON.stringify(order), { expirationTtl: 3600 });
    return order;
  }

  /** Simulates a successful checkout and returns a valid signed handler payload. */
  async simulateSuccess(orderId: string, method = 'upi') {
    const order = await useKv().cache.get<ProviderOrder>(this.orderKey(orderId), 'json');
    const amountMinor = order?.amountMinor ?? 0;
    const paymentId = `pay_mock_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const payment: ProviderPayment = {
      id: paymentId,
      orderId,
      amountMinor,
      currency: order?.currency ?? 'INR',
      status: 'captured',
      method,
    };
    await useKv().cache.put(this.payKey(paymentId), JSON.stringify(payment), { expirationTtl: 86_400 });
    return {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: createHmac('sha256', this.secret).update(`${orderId}|${paymentId}`).digest('hex'),
    };
  }

  async fetchPayment(paymentId: string): Promise<ProviderPayment | null> {
    return (await useKv().cache.get<ProviderPayment>(this.payKey(paymentId), 'json')) ?? null;
  }

  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean {
    const expected = createHmac('sha256', this.secret).update(`${input.orderId}|${input.paymentId}`).digest('hex');
    return safeEqual(expected, input.signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const expected = createHmac('sha256', this.secret).update(rawBody).digest('hex');
    return safeEqual(expected, signature);
  }

  signWebhook(rawBody: string): string {
    return createHmac('sha256', this.secret).update(rawBody).digest('hex');
  }
}

export function paymentProvider(): PaymentProvider {
  const c = config();
  return razorpayConfigured()
    ? new RazorpayProvider(c.razorpayKeyId, c.razorpayKeySecret, c.razorpayWebhookSecret)
    : new MockProvider(c.razorpayKeySecret || c.authSecret);
}

export function providerIsMock(): boolean {
  return paymentProvider().isMock;
}
