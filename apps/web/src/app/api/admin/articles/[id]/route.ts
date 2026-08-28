import { handle, ok } from '@/lib/api';
import { requireEditor } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { getArticleById } from '@/services/articles';

export const dynamic = 'force-dynamic';

/** Loads a single article including its full body, for the editor. */
export const GET = handle(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const routeCtx = await routeContext(request, { csrf: false });
  await routeCtx.limit('adminRead');
  await requireEditor();

  const { id } = await context.params;
  return ok({ article: await getArticleById(id) });
});
