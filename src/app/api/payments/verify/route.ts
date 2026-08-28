import { handle, ok, parseBody } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { verifyPaymentSchema } from '@/lib/validation';
import { verifyCheckout } from '@/services/payments';

export const dynamic = 'force-dynamic';

/**
 * Step 2: verify the checkout callback.
 *
 * The browser's "success" handler is treated as an untrusted hint. We verify the
 * HMAC signature over `order_id|payment_id`, then re-fetch the payment from the
 * provider and compare its amount and status before any entitlement is granted.
 */
export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('payment');

  const user = await requireUser();
  const body = await parseBody(request, verifyPaymentSchema);

  const result = await verifyCheckout({
    userId: user.id,
    orderId: body.razorpay_order_id,
    paymentId: body.razorpay_payment_id,
    signature: body.razorpay_signature,
  });

  return ok(result);
});
