import { handle, ok, parseBody } from '@/lib/api';
import { routeContext } from '@/lib/route-context';
import { analyticsEventSchema } from '@/lib/validation';
import { trackEvent, trackPageView } from '@/services/analytics';

export const dynamic = 'force-dynamic';

/**
 * First-party analytics collector.
 *
 * Accepts only a whitelisted event-name shape and a small props object. Visitor
 * identity is a keyed hash computed server-side — the client cannot supply it.
 */
export const POST = handle(async (request: Request) => {
  const context = await routeContext(request, { csrf: false });
  await context.limit('analytics');

  const body = await parseBody(request, analyticsEventSchema);

  if (body.name === 'page.view' && body.path) {
    await trackPageView({
      path: body.path,
      userId: context.access.userId,
      visitorHash: context.visitorHash,
      referrer: request.headers.get('referer'),
    });
  } else {
    await trackEvent({
      name: body.name,
      userId: context.access.userId,
      visitorHash: context.visitorHash,
      props: body.props,
    });
  }

  return ok({ recorded: true });
});
