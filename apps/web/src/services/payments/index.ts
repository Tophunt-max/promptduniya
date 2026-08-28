import { apiRequest, query } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import { AppError } from '@/lib/api';

/**
 * Checkout, delegated to the API.
 *
 * The security invariants live entirely server-side: the charge amount is
 * derived from the plan row (never the client), the gateway signature is
 * verified and the payment re-fetched before premium is granted, and webhook
 * processing is idempotent. The website only relays.
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

export interface VerificationResult {
  status: 'activated' | 'pending' | 'failed';
  planName: string;
  subscriptionId: string | null;
  endsAt: number | null;
  message: string;
}

export interface WebhookOutcome {
  handled: boolean;
  duplicate: boolean;
  eventType: string;
  message: string;
}

export interface PaymentRow {
  id: string;
  amountMinor: number;
  discountMinor: number;
  currency: string;
  status: string;
  method: string | null;
  planName: string | null;
  receiptId: string | null;
  createdAt: number;
}

export interface AdminPaymentRow {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  amountMinor: number;
  currency: string;
  status: string;
  method: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  receiptId: string | null;
  createdAt: number;
}

export interface PaymentEventRow {
  id: string;
  eventType: string;
  eventKey: string;
  signatureValid: boolean;
  processedAt: number | null;
  processingError: string | null;
  createdAt: number;
}

async function token(): Promise<string> {
  const value = await getAccessToken();
  if (!value) throw AppError.unauthorized();
  return value;
}

export async function createCheckoutIntent(input: {
  userId: string;
  planCode: string;
  couponCode?: string;
}): Promise<CheckoutIntent> {
  return apiRequest<CheckoutIntent>('/v1/payments/order', {
    method: 'POST',
    token: await token(),
    body: { planCode: input.planCode, couponCode: input.couponCode },
  });
}

export async function verifyCheckout(input: {
  userId: string;
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<VerificationResult> {
  return apiRequest<VerificationResult>('/v1/payments/verify', {
    method: 'POST',
    token: await token(),
    body: {
      razorpayOrderId: input.orderId,
      razorpayPaymentId: input.paymentId,
      razorpaySignature: input.signature,
    },
  });
}

/**
 * Runs the local checkout simulator. Only available while the API is configured
 * with the mock provider; it refuses once real credentials are present.
 */
export async function completeMockCheckout(orderId: string): Promise<VerificationResult> {
  return apiRequest<VerificationResult>('/v1/payments/mock-complete', {
    method: 'POST',
    token: await token(),
    body: { orderId },
  });
}

/**
 * Gateway webhooks are delivered straight to the API worker, which owns the
 * signing secret. This remains only so the legacy website URL keeps answering.
 */
export async function processWebhook(_input: {
  rawBody: string;
  signature: string | null;
  deliveryId: string | null;
}): Promise<WebhookOutcome> {
  return {
    handled: false,
    duplicate: false,
    eventType: 'unsupported',
    message: 'Webhooks are handled by the API at /v1/webhooks/razorpay.',
  };
}

export async function listUserPayments(_userId: string, limit = 30): Promise<PaymentRow[]> {
  const data = await apiRequest<{ items: PaymentRow[] }>(`/v1/payments/history${query({ limit })}`, {
    token: await token(),
  });
  return data.items;
}

export async function adminListPayments(options: {
  page?: number;
  pageSize?: number;
  status?: string;
}): Promise<{ items: AdminPaymentRow[]; total: number; page: number; pageSize: number }> {
  return apiRequest(
    `/v1/admin/payments${query({
      page: options.page,
      pageSize: options.pageSize,
      status: options.status,
    })}`,
    { token: await token() },
  );
}

export async function adminListPaymentEvents(limit = 50): Promise<PaymentEventRow[]> {
  const data = await apiRequest<{ items: PaymentEventRow[] }>(
    `/v1/admin/payments/events${query({ limit })}`,
    { token: await token() },
  );
  return data.items;
}
