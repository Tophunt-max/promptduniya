import { handle, created, parseBody } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { createOrderSchema } from '@/lib/validation';
import { createCheckoutIntent } from '@/services/payments';

export const dynamic = 'force-dynamic';

/**
 * Step 1 of the payment flow: create the provider order server-side.
 *
 * The request body carries only a plan *code* and an optional coupon code. The
 * amount is looked up from the `plans` table — a client-supplied price is never
 * read, so a tampered request cannot change what is charged.
 */
export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('payment');

  const user = await requireUser();
  const body = await parseBody(request, createOrderSchema);

  const intent = await createCheckoutIntent({
    userId: user.id,
    planCode: body.planCode,
    couponCode: body.couponCode,
  });

  return created({
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
    prefill: { name: user.name, email: user.email },
  });
});
