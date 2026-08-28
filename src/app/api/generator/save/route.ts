import { handle, noContent, ok, parseBody, parseQuery } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { idSchema, saveGeneratedSchema } from '@/lib/validation';
import { deleteGenerated, saveGenerated } from '@/services/generator';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('generator');

  const user = await requireUser();
  const body = await parseBody(request, saveGeneratedSchema);

  await saveGenerated(user.id, body.generatedId, body.title);
  return ok({ saved: true });
});

export const DELETE = handle(async (request: Request) => {
  await routeContext(request);
  const user = await requireUser();
  const { id } = parseQuery(request, z.object({ id: idSchema }));

  await deleteGenerated(user.id, id);
  return noContent();
});
