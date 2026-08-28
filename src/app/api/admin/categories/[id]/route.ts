import { handle, noContent, ok, parseBody } from '@/lib/api';
import { requireEditor } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { categoryWriteSchema } from '@/lib/validation';
import { logAdminAction } from '@/services/admin';
import { deleteCategory, updateCategory } from '@/services/categories';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const PATCH = handle(async (request: Request, context: Context) => {
  const routeCtx = await routeContext(request);
  await routeCtx.limit('adminWrite');
  const actor = await requireEditor();
  const { id } = await context.params;

  const body = await parseBody(request, categoryWriteSchema);
  const result = await updateCategory(id, body);

  await logAdminAction({
    actorId: actor.id,
    action: 'category.update',
    targetType: 'category',
    targetId: id,
    meta: { slug: result.slug },
    ipHash: routeCtx.ipHash,
  });

  return ok(result);
});

export const DELETE = handle(async (request: Request, context: Context) => {
  const routeCtx = await routeContext(request);
  await routeCtx.limit('adminWrite');
  const actor = await requireEditor();
  const { id } = await context.params;

  // Refuses when prompts or subcategories still reference this category.
  await deleteCategory(id);

  await logAdminAction({
    actorId: actor.id,
    action: 'category.delete',
    targetType: 'category',
    targetId: id,
    ipHash: routeCtx.ipHash,
  });

  return noContent();
});
