import { AppError, handle, ok } from '@/lib/api';
import { safeEqual } from '@/lib/crypto';
import { env } from '@/lib/env';
import { publishScheduled, recomputeTrending } from '@/services/prompts';
import { expireDueSubscriptions, remindExpiringSubscriptions } from '@/services/subscriptions';

export const dynamic = 'force-dynamic';

/**
 * Scheduled maintenance tasks.
 *
 * Intended to be called by a platform scheduler (Vercel Cron, GitHub Actions, or
 * any cron that can send a header). Authenticated with a bearer token compared
 * in constant time against AUTH_SECRET — this endpoint mutates subscription
 * state, so it must not be publicly callable.
 *
 * Suggested schedule: hourly.
 */
async function runTasks() {
  const [published, trending, expired, reminded] = await Promise.all([
    publishScheduled(),
    recomputeTrending(),
    expireDueSubscriptions(),
    remindExpiringSubscriptions(5),
  ]);

  return {
    scheduledPromptsPublished: published,
    trendingPromptsFlagged: trending,
    subscriptionsExpired: expired,
    expiryRemindersSent: reminded,
    ranAt: new Date().toISOString(),
  };
}

function assertAuthorised(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  const expected = env().CRON_SECRET ?? '';
  if (!expected || !token || !safeEqual(token, expected)) {
    throw AppError.forbidden('Invalid or missing cron token');
  }
}

export const POST = handle(async (request: Request) => {
  assertAuthorised(request);
  return ok(await runTasks());
});

/** Some schedulers only issue GET requests. */
export const GET = handle(async (request: Request) => {
  assertAuthorised(request);
  return ok(await runTasks());
});
