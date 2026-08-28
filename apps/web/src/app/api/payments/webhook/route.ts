import { NextResponse } from 'next/server';

import { handle, ok } from '@/lib/api';
import { enforce } from '@/lib/rate-limit';
import { clientIp } from '@/lib/api';
import { hashIp } from '@/lib/crypto';
import { processWebhook } from '@/services/payments';

export const dynamic = 'force-dynamic';

/**
 * Provider webhook endpoint.
 *
 * Notes on correctness:
 *  - The body is read as raw text. The signature is an HMAC over those exact
 *    bytes, so re-serialising the JSON would break verification.
 *  - No session or CSRF check applies here (the caller is Razorpay, not a
 *    browser); authenticity comes entirely from the signature.
 *  - Delivery is idempotent: the event id is stored with a unique constraint, so
 *    a redelivered event returns 200 without creating a second transaction.
 */
export const POST = handle(async (request: Request) => {
  await enforce('webhook', { identifier: hashIp(clientIp(request)) });

  const rawBody = await request.text();
  const signature =
    request.headers.get('x-razorpay-signature') ?? request.headers.get('x-webhook-signature');
  const deliveryId =
    request.headers.get('x-razorpay-event-id') ?? request.headers.get('x-webhook-event-id');

  const outcome = await processWebhook({ rawBody, signature, deliveryId });

  // Always answer 200 for events we accepted, so the provider stops retrying.
  return ok(outcome);
});

/** Some providers probe the URL with a GET before enabling a webhook. */
export function GET() {
  return NextResponse.json({ ok: true, data: { status: 'ready' } });
}
