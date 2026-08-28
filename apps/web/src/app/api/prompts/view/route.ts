import { handle, ok, parseBody } from '@/lib/api';
import { routeContext } from '@/lib/route-context';
import { promptIdSchema } from '@/lib/validation';
import { recordView } from '@/services/prompts';

export const dynamic = 'force-dynamic';

/**
 * Records a prompt view.
 *
 * Called from the client after paint so view counting never blocks or delays
 * the server-rendered page, and is de-duplicated per visitor per day.
 */
export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('view');

  const body = await parseBody(request, promptIdSchema);

  await recordView({
    promptId: body.promptId,
    userId: context.access.userId,
    visitorHash: context.visitorHash,
    referrer: request.headers.get('referer'),
  });

  return ok({ recorded: true });
});
