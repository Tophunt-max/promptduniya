import { AppError, handle, ok, parseBody } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { verifyCheckout } from '@/services/payments';
import { MockProvider, paymentProvider } from '@/services/payments/provider';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({ orderId: z.string().min(4).max(120) });

/**
 * Local/CI checkout simulator.
 *
 * Only reachable while the mock provider is active (no real Razorpay
 * credentials). It generates a genuinely signed payload and then runs it through
 * the exact same `verifyCheckout` path as production — so the signature check,
 * amount cross-check and idempotency logic are all still exercised. It refuses
 * to run the moment real credentials are configured.
 */
export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('payment');

  const user = await requireUser();
  const provider = paymentProvider();

  if (!(provider instanceof MockProvider)) {
    throw AppError.forbidden('Checkout simulation is disabled when a live payment gateway is configured');
  }

  const body = await parseBody(request, schema);
  const handlerPayload = await provider.simulateSuccess(body.orderId);

  const result = await verifyCheckout({
    userId: user.id,
    orderId: handlerPayload.razorpay_order_id,
    paymentId: handlerPayload.razorpay_payment_id,
    signature: handlerPayload.razorpay_signature,
  });

  return ok(result);
});
