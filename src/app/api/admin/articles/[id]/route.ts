import { eq } from 'drizzle-orm';

import { AppError, handle, ok } from '@/lib/api';
import { requireEditor } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { db } from '@/db';
import { articles } from '@/db/schema';

export const dynamic = 'force-dynamic';

/** Loads a single article including its full body, for the editor. */
export const GET = handle(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const routeCtx = await routeContext(request, { csrf: false });
  await routeCtx.limit('adminRead');
  await requireEditor();

  const { id } = await context.params;
  const rows = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  const article = rows[0];
  if (!article) throw AppError.notFound('Article not found');

  return ok({ article });
});
