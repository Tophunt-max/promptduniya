import { handle, ok } from '@/lib/api';
import { destroySession } from '@/lib/auth/session';
import { routeContext } from '@/lib/route-context';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: Request) => {
  await routeContext(request);
  await destroySession();
  return ok({ signedOut: true });
});
