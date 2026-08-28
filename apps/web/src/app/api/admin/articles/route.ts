import { z } from 'zod';

import { created, handle, noContent, ok, parseBody, parseQuery } from '@/lib/api';
import { requireEditor } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { articleWriteSchema, idSchema } from '@/lib/validation';
import { logAdminAction } from '@/services/admin';
import { adminListArticles, createArticle, deleteArticle, updateArticle } from '@/services/articles';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const context = await routeContext(request, { csrf: false });
  await context.limit('adminRead');
  await requireEditor();

  return ok({ items: await adminListArticles() });
});

export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('adminWrite');
  const actor = await requireEditor();

  const body = await parseBody(request, articleWriteSchema);
  const result = await createArticle(body, actor.id);

  await logAdminAction({
    actorId: actor.id,
    action: 'article.create',
    targetType: 'article',
    targetId: result.id,
    meta: { slug: result.slug },
    ipHash: context.ipHash,
  });

  return created(result);
});

export const PATCH = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('adminWrite');
  const actor = await requireEditor();

  const body = await parseBody(request, articleWriteSchema.and(z.object({ id: idSchema })));
  const { id, ...values } = body;
  const result = await updateArticle(id, values);

  await logAdminAction({
    actorId: actor.id,
    action: 'article.update',
    targetType: 'article',
    targetId: id,
    meta: { slug: result.slug },
    ipHash: context.ipHash,
  });

  return ok(result);
});

export const DELETE = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('adminWrite');
  const actor = await requireEditor();

  const { id } = parseQuery(request, z.object({ id: idSchema }));
  await deleteArticle(id);

  await logAdminAction({
    actorId: actor.id,
    action: 'article.delete',
    targetType: 'article',
    targetId: id,
    ipHash: context.ipHash,
  });

  return noContent();
});
