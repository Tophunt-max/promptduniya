import { AppError, handle, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { routeContext } from '@/lib/route-context';
import { cancelSubscription, currentSubscription } from '@/services/subscriptions';

export const dynamic = 'force-dynamic';

/**
 * Turns off auto-renewal.
 *
 * Access deliberately continues until the paid period ends — cancelling is not a
 * refund, and revoking immediately would be taking away something already paid for.
 */
export const POST = handle(async (request: Request) => {
  const context = await routeContext(request);
  await context.limit('payment');

  const user = await requireUser();
  const subscription = await currentSubscription(user.id);
  if (!subscription) throw AppError.notFound('You do not have an active membership');

  await cancelSubscription(user.id, subscription.id);

  return ok({
    cancelled: true,
    accessUntil: subscription.endDate,
    message: subscription.endDate
      ? 'Auto-renewal is off. You keep premium access until the end of your current period.'
      : 'Auto-renewal is off.',
  });
});
