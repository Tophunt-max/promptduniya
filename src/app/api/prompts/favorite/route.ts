import { handle, noContent, ok, parseBody, parseQuery } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { favoriteSchema, promptIdSchema } from '@/lib/validation';
import { removeFavorite, toggleFavorite } from '@/services/engagement';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('favorite');

  await requireUser();
  const body = await parseBody(request, favoriteSchema);

  const result = await toggleFavorite(context.access, body.promptId, {
    collectionName: body.collectionName,
    note: body.note,
  });

  return ok({
    saved: result.saved,
    favoriteCount: result.favoriteCount,
    usage: {
      used: result.usage.used,
      limit: result.usage.limit,
      remaining: result.usage.unlimited ? -1 : result.usage.remaining,
      unlimited: result.usage.unlimited,
    },
  });
});

export const DELETE = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('favorite');

  const user = await requireUser();
  const { promptId } = parseQuery(request, promptIdSchema);

  await removeFavorite(user.id, promptId);
  return noContent();
});
