import { handle, created, parseBody } from '@/lib/api';
import { routeContext } from '@/lib/route-context';
import { reportSchema } from '@/lib/validation';
import { createReport } from '@/services/admin';

export const dynamic = 'force-dynamic';

/** Content reports feed the admin moderation queue. */
export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('report');

  const body = await parseBody(request, reportSchema);

  await createReport({
    reporterId: context.access.userId,
    targetType: body.targetType,
    targetId: body.targetId,
    reason: body.reason,
    details: body.details,
  });

  return created({
    reported: true,
    message: 'Thanks for flagging this — our team will take a look.',
  });
});
