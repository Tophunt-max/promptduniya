import { handle, ok, parseBody } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { promptIdSchema } from '@/lib/validation';
import { toggleLike } from '@/services/engagement';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('like');

  const user = await requireUser();
  const body = await parseBody(request, promptIdSchema);

  const result = await toggleLike(user.id, body.promptId);
  return ok(result);
});
