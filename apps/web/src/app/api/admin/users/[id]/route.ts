import { handle, ok, parseBody } from '@/lib/api';
import { requireAdmin } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { adminUserUpdateSchema } from '@/lib/validation';
import { adminUpdateUser, adminUserDetail } from '@/services/admin';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const GET = handle(async (request: Request, context: Context) => {
  const routeCtx = await routeContext(request, { csrf: false });
  await routeCtx.limit('adminRead');
  await requireAdmin();
  const { id } = await context.params;

  return ok(await adminUserDetail(id));
});

/**
 * Updates status, roles or premium grants.
 *
 * Requires the strict `admin` role — editors cannot change roles or grant
 * premium. The service layer also refuses to let an admin suspend themselves or
 * remove their own admin role, which prevents accidental lock-out.
 */
export const PATCH = handle(async (request: Request, context: Context) => {
  const routeCtx = await routeContext(request);
  await routeCtx.limit('adminWrite');
  const actor = await requireAdmin();
  const { id } = await context.params;

  const body = await parseBody(request, adminUserUpdateSchema);

  await adminUpdateUser({
    actorId: actor.id,
    userId: id,
    status: body.status,
    roles: body.roles,
    grantPremiumDays: body.grantPremiumDays,
    revokePremium: body.revokePremium,
  });

  return ok(await adminUserDetail(id));
});
