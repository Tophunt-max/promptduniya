import { z } from 'zod';

import { handle, ok, parseBody } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { completeMockCheckout } from '@/services/payments';

export const dynamic = 'force-dynamic';

const schema = z.object({ orderId: z.string().min(4).max(120) });

/**
 * Local/CI checkout simulator.
 *
 * Forwards to the API, which generates a genuinely signed payload and runs it
 * through the exact same verification path as production — signature check,
 * amount cross-check and idempotency all still apply. The API refuses the call
 * the moment real gateway credentials are configured.
 */
export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('payment');
  await requireUser();

  const body = await parseBody(request, schema);
  return ok(await completeMockCheckout(body.orderId));
});
