import { createHmac } from 'node:crypto';

import { env, razorpayConfigured } from '@/lib/env';
import { safeEqual } from '@/lib/crypto';
import { newReference } from '@/lib/id';

/**
 * Payment provider adapter.
 *
 * `RazorpayProvider` talks to the live REST API. `MockProvider` implements the
 * exact same interface — including real HMAC signature generation — so the full
 * order → verify → webhook flow can be exercised locally and in CI without
 * credentials or network access. Nothing here is ever imported by client code.
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
  errorDescription: string | null;
}

export interface ProviderRefund {
  id: string;
  paymentId: string;
  amountMinor: number;
  status: string;
}

export interface PaymentProvider {
  readonly name: string;
  readonly isMock: boolean;
  /** Public key id that may be shipped to the browser for Checkout. */
  publicKeyId(): string;
  createOrder(input: {
    amountMinor: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<ProviderOrder>;
  fetchPayment(paymentId: string): Promise<ProviderPayment | null>;
  /** Verifies the checkout handler signature: HMAC(order_id|payment_id). */
  verifyCheckoutSignature(input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean;
  /** Verifies the webhook signature over the exact raw request body. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  refund(input: { paymentId: string; amountMinor?: number }): Promise<ProviderRefund>;
}

const RAZORPAY_API = 'https://api.razorpay.com/v1';

class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay';
  readonly isMock = false;

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
  ) {}

  publicKeyId() {
    return this.keyId;
  }

  private authHeader() {
    return `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${RAZORPAY_API}${path}`, {
      ...init,
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
    });

    const text = await response.text();
    if (!response.ok) {
      let message = `Razorpay ${response.status}`;
      try {
        const parsed = JSON.parse(text) as { error?: { description?: string } };
        if (parsed.error?.description) message = parsed.error.description;
      } catch {
        /* keep the generic message */
      }
      throw new Error(message);
    }

    return JSON.parse(text) as T;
  }

  async createOrder(input: {
    amountMinor: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<ProviderOrder> {
    const body = await this.request<{
      id: string;
      amount: number;
      currency: string;
      receipt: string;
      status: string;
    }>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        amount: input.amountMinor,
        currency: input.currency,
        receipt: input.receipt,
        payment_capture: 1,
        notes: input.notes ?? {},
      }),
    });

    return {
      id: body.id,
      amountMinor: body.amount,
      currency: body.currency,
      receipt: body.receipt,
      status: body.status,
    };
  }

  async fetchPayment(paymentId: string): Promise<ProviderPayment | null> {
    try {
      const body = await this.request<{
        id: string;
        order_id: string | null;
        amount: number;
        currency: string;
        status: string;
        method: string | null;
        error_description: string | null;
      }>(`/payments/${encodeURIComponent(paymentId)}`);

      return {
        id: body.id,
        orderId: body.order_id,
        amountMinor: body.amount,
        currency: body.currency,
        status: body.status,
        method: body.method,
        errorDescription: body.error_description,
      };
    } catch (error) {
      console.error('[payments] fetchPayment failed:', error);
      return null;
    }
  }

  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean {
    const expected = createHmac('sha256', this.keySecret)
      .update(`${input.orderId}|${input.paymentId}`)
      .digest('hex');
    return safeEqual(expected, input.signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!this.webhookSecret) return false;
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return safeEqual(expected, signature);
  }

  async refund(input: { paymentId: string; amountMinor?: number }): Promise<ProviderRefund> {
    const body = await this.request<{
      id: string;
      payment_id: string;
      amount: number;
      status: string;
    }>(`/payments/${encodeURIComponent(input.paymentId)}/refund`, {
      method: 'POST',
      body: JSON.stringify(input.amountMinor ? { amount: input.amountMinor } : {}),
    });

    return {
      id: body.id,
      paymentId: body.payment_id,
      amountMinor: body.amount,
      status: body.status,
    };
  }
}

/**
 * Local/CI provider. Signatures are computed with the same HMAC scheme as
 * Razorpay so signature verification is genuinely exercised — the flow is
 * simulated, never bypassed.
 */
export class MockProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly isMock = true;
  private orders = new Map<string, ProviderOrder>();
  private paymentsById = new Map<string, ProviderPayment>();

  constructor(private readonly secret: string) {}

  publicKeyId() {
    return 'rzp_test_mock0000000000';
  }

  async createOrder(input: {
    amountMinor: number;
    currency: string;
    receipt: string;
  }): Promise<ProviderOrder> {
    const order: ProviderOrder = {
      id: `order_mock_${newReference('').replace(/[^A-Z0-9]/g, '')}${Date.now().toString(36)}`,
      amountMinor: input.amountMinor,
      currency: input.currency,
      receipt: input.receipt,
      status: 'created',
    };
    this.orders.set(order.id, order);
    return order;
  }

  /** Simulates a successful checkout and returns a valid signed handler payload. */
  async simulateSuccess(orderId: string, method = 'upi') {
    const order = this.orders.get(orderId);
    const amountMinor = order?.amountMinor ?? 0;
    const paymentId = `pay_mock_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    this.paymentsById.set(paymentId, {
      id: paymentId,
      orderId,
      amountMinor,
      currency: order?.currency ?? 'INR',
      status: 'captured',
      method,
      errorDescription: null,
    });

    return {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: createHmac('sha256', this.secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex'),
    };
  }

  async fetchPayment(paymentId: string): Promise<ProviderPayment | null> {
    return this.paymentsById.get(paymentId) ?? null;
  }

  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean {
    const expected = createHmac('sha256', this.secret)
      .update(`${input.orderId}|${input.paymentId}`)
      .digest('hex');
    return safeEqual(expected, input.signature);
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const expected = createHmac('sha256', this.secret).update(rawBody).digest('hex');
    return safeEqual(expected, signature);
  }

  /** Produces a signature for a webhook body, for tests and local simulation. */
  signWebhook(rawBody: string): string {
    return createHmac('sha256', this.secret).update(rawBody).digest('hex');
  }

  async refund(input: { paymentId: string; amountMinor?: number }): Promise<ProviderRefund> {
    const payment = this.paymentsById.get(input.paymentId);
    return {
      id: `rfnd_mock_${Date.now().toString(36)}`,
      paymentId: input.paymentId,
      amountMinor: input.amountMinor ?? payment?.amountMinor ?? 0,
      status: 'processed',
    };
  }
}

const globalForProvider = globalThis as unknown as { __pdProvider?: PaymentProvider };

export function paymentProvider(): PaymentProvider {
  if (globalForProvider.__pdProvider) return globalForProvider.__pdProvider;

  const e = env();
  globalForProvider.__pdProvider = razorpayConfigured()
    ? new RazorpayProvider(e.RAZORPAY_KEY_ID!, e.RAZORPAY_KEY_SECRET!, e.RAZORPAY_WEBHOOK_SECRET ?? '')
    : new MockProvider(e.RAZORPAY_KEY_SECRET || e.AUTH_SECRET);

  return globalForProvider.__pdProvider;
}

/** Test seam. */
export function setPaymentProvider(provider: PaymentProvider | null) {
  globalForProvider.__pdProvider = provider ?? undefined;
}

export function providerIsMock(): boolean {
  return paymentProvider().isMock;
}
