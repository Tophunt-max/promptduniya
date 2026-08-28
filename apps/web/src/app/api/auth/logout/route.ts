import { handle, ok } from '@/lib/api';
import { apiLogout } from '@/lib/auth/api-auth';
import { clearSession } from '@/lib/auth/session';
import { routeContext } from '@/lib/route-context';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  // Revoke the refresh token server-side first, then drop the local cookies.
  // Clearing cookies happens regardless so a failed revoke never traps a user
  // in a signed-in state.
  await apiLogout(context.accessToken);
  await clearSession();
  return ok({ signedOut: true });
});
