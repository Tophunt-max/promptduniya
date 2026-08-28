import { created, handle, ok, parseBody, parseQuery } from '@/lib/api';
import { requireEditor } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { promptWriteSchema } from '@/lib/validation';
import { logAdminAction } from '@/services/admin';
import { adminListPrompts, createPrompt } from '@/services/prompts';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
  q: z.string().max(120).optional(),
  status: z.enum(['all', 'published', 'draft']).optional().default('all'),
  model: z.string().max(40).optional(),
  category: z.string().max(120).optional(),
});

export const GET = handle(async (request: Request) => {
  const context = await routeContext(request, { csrf: false });
  await context.limit('adminRead');
  await requireEditor();

  const query = parseQuery(request, listQuerySchema);
  const result = await adminListPrompts(query);

  return ok(result);
});

export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('adminWrite');
  const actor = await requireEditor();

  const body = await parseBody(request, promptWriteSchema);
  const result = await createPrompt(body, actor.id);

  await logAdminAction({
    actorId: actor.id,
    action: 'prompt.create',
    targetType: 'prompt',
    targetId: result.id,
    meta: { slug: result.slug, published: body.isPublished },
    ipHash: context.ipHash,
  });

  return created(result);
});
