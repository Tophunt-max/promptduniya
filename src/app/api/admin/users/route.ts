import { handle, ok, parseQuery } from '@/lib/api';
import { requireAdmin } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { adminUserQuerySchema } from '@/lib/validation';
import { adminListUsers } from '@/services/admin';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const context = await routeContext(request, { csrf: false });
  await context.limit('adminRead');
  await requireAdmin();

  const query = parseQuery(request, adminUserQuerySchema);
  return ok(await adminListUsers(query));
});
