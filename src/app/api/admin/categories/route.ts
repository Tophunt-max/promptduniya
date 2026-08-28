import { created, handle, ok, parseBody } from '@/lib/api';
import { requireEditor } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { categoryWriteSchema } from '@/lib/validation';
import { logAdminAction } from '@/services/admin';
import { adminListCategories, createCategory } from '@/services/categories';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const context = await routeContext(request, { csrf: false });
  await context.limit('adminRead');
  await requireEditor();

  return ok({ items: await adminListCategories() });
});

export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('adminWrite');
  const actor = await requireEditor();

  const body = await parseBody(request, categoryWriteSchema);
  const result = await createCategory(body);

  await logAdminAction({
    actorId: actor.id,
    action: 'category.create',
    targetType: 'category',
    targetId: result.id,
    meta: { slug: result.slug },
    ipHash: context.ipHash,
  });

  return created(result);
});
