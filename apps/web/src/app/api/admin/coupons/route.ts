import { z } from 'zod';

import { created, handle, noContent, ok, parseBody, parseQuery } from '@/lib/api';
import { requireAdmin } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { couponWriteSchema, idSchema } from '@/lib/validation';
import { logAdminAction } from '@/services/admin';
import { createCoupon, deleteCoupon, listCoupons, updateCoupon } from '@/services/coupons';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const context = await routeContext(request, { csrf: false });
  await context.limit('adminRead');
  await requireAdmin();

  return ok({ items: await listCoupons() });
});

export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('adminWrite');
  const actor = await requireAdmin();

  const body = await parseBody(request, couponWriteSchema);
  const result = await createCoupon(body, actor.id);

  await logAdminAction({
    actorId: actor.id,
    action: 'coupon.create',
    targetType: 'coupon',
    targetId: result.id,
    meta: { code: result.code },
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
    couponWriteSchema.and(z.object({ id: idSchema })),
  );

  const { id, ...values } = body;
  await updateCoupon(id, values);

  await logAdminAction({
    actorId: actor.id,
    action: 'coupon.update',
    targetType: 'coupon',
    targetId: id,
    meta: { code: values.code },
    ipHash: context.ipHash,
  });

  return ok({ id });
});

export const DELETE = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('adminWrite');
  const actor = await requireAdmin();

  const { id } = parseQuery(request, z.object({ id: idSchema }));
  await deleteCoupon(id);

  await logAdminAction({
    actorId: actor.id,
    action: 'coupon.delete',
    targetType: 'coupon',
    targetId: id,
    ipHash: context.ipHash,
  });

  return noContent();
});
