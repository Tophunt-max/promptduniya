import { z } from 'zod';

import { handle, ok, parseBody, parseQuery } from '@/lib/api';
import { requireEditor } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { idSchema } from '@/lib/validation';
import {
  listComments,
  listContactMessages,
  listReports,
  moderateComment,
  resolveReport,
  updateContactStatus,
} from '@/services/admin';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const context = await routeContext(request, { csrf: false });
  await context.limit('adminRead');
  await requireEditor();

  const { tab, status } = parseQuery(
    request,
    z.object({
      tab: z.enum(['reports', 'comments', 'messages']).optional().default('reports'),
      status: z.string().max(20).optional(),
    }),
  );

  if (tab === 'comments') return ok({ items: await listComments(status) });
  if (tab === 'messages') return ok({ items: await listContactMessages(status) });
  return ok({ items: await listReports(status) });
});

/** Resolves a report, moderates a comment, or updates a message status. */
export const PATCH = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('adminWrite');
  const actor = await requireEditor();

  const body = await parseBody(
    request,
    z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('report'),
        id: idSchema,
        status: z.enum(['reviewing', 'resolved', 'dismissed']),
        note: z.string().max(500).optional(),
      }),
      z.object({
        kind: z.literal('comment'),
        id: idSchema,
        status: z.enum(['approved', 'rejected']),
      }),
      z.object({
        kind: z.literal('message'),
        id: idSchema,
        status: z.enum(['new', 'read', 'replied', 'spam']),
      }),
    ]),
  );

  if (body.kind === 'report') {
    await resolveReport({
      actorId: actor.id,
      reportId: body.id,
      status: body.status,
      note: body.note,
    });
  } else if (body.kind === 'comment') {
    await moderateComment({ actorId: actor.id, commentId: body.id, status: body.status });
  } else {
    await updateContactStatus(body.id, body.status);
  }

  return ok({ id: body.id, status: body.status });
});
