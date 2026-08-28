import { z } from 'zod';

import { created, handle, ok, parseBody } from '@/lib/api';
import { requireAdmin } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { planWriteSchema } from '@/lib/validation';
import { logAdminAction } from '@/services/admin';
import { listPlans, setPlanActive, upsertPlan } from '@/services/plans';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const context = await routeContext(request, { csrf: false });
  await context.limit('adminRead');
  await requireAdmin();

  return ok({ items: await listPlans({ activeOnly: false }) });
});

/**
 * Creates or updates a plan, including its price.
 *
 * This is the only place a price can change, it is admin-only, and it is
 * audited — checkout always reads the price back from this table.
 */
export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('adminWrite');
  const actor = await requireAdmin();

  const body = await parseBody(request, planWriteSchema);
  const result = await upsertPlan(body);

  await logAdminAction({
    actorId: actor.id,
    action: 'plan.upsert',
    targetType: 'plan',
    targetId: result.id,
    meta: { code: body.code, priceMinor: body.priceMinor },
    ipHash: context.ipHash,
  });

  return created(result);
});

export const PATCH = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('adminWrite');
  const actor = await requireAdmin();

  const body = await parseBody(
    request,
    z.object({ id: z.string().min(4), isActive: z.boolean() }),
  );

  await setPlanActive(body.id, body.isActive);

  await logAdminAction({
    actorId: actor.id,
    action: 'plan.toggle',
    targetType: 'plan',
    targetId: body.id,
    meta: { isActive: body.isActive },
    ipHash: context.ipHash,
  });

  return ok({ id: body.id, isActive: body.isActive });
});
