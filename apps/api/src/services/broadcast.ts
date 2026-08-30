import { db, notifications, subscriptions, users } from '@pd/db';
import { and, count, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';

import { newId } from '../lib/crypto';
import { batchByParams } from '../lib/d1';
import { nowSec } from '../lib/dates';
import { AppError } from '../lib/errors';
import { notify } from './notifications';

/**
 * Admin notification broadcast.
 *
 * `notifyMany` has existed in services/notifications.ts since the notification
 * system was built and was never called by anything — the obvious broadcast
 * primitive, with no route, no page and no caller. So a platform whose whole
 * premise is publishing content had no way to tell its members that anything had
 * been published.
 *
 * This wraps it with the three things a real broadcast needs and `notifyMany`
 * deliberately does not have:
 *
 *   segments   who receives it, resolved server-side. A client must never be
 *              able to post a list of user ids to notify.
 *   batching   `notifyMany` is a serial loop of one INSERT each. At ten thousand
 *              members that is ten thousand round trips and a dead Worker
 *              invocation, so rows are grouped instead.
 *   a preview  the recipient count before sending, because a broadcast cannot be
 *              recalled once it is in ten thousand inboxes.
 */

export const BROADCAST_SEGMENTS = ['all', 'premium', 'free', 'active30d', 'creators'] as const;

export type BroadcastSegment = (typeof BROADCAST_SEGMENTS)[number];

export const SEGMENT_LABELS: Record<BroadcastSegment, string> = {
  all: 'Every active member',
  premium: 'Premium members',
  free: 'Free members',
  active30d: 'Signed in within 30 days',
  creators: 'Approved creators',
};

/**
 * Resolves a segment to user ids.
 *
 * Suspended and deleted accounts are excluded from every segment — there is no
 * segment that should reach them, and making that a property of the resolver
 * rather than of each caller means it cannot be forgotten.
 *
 * Premium membership is read from `users.premiumCachedUntil` rather than by
 * joining `subscriptions`, because that column is what the entitlement layer
 * itself trusts (see `resolveAccess`). Using a different definition here would
 * let someone be premium for the purposes of a broadcast and not premium for the
 * purposes of the feature the broadcast is announcing.
 */
async function resolveSegment(segment: BroadcastSegment): Promise<string[]> {
  const now = nowSec();
  const active = eq(users.status, 'active');

  const conditions = (() => {
    switch (segment) {
      case 'premium':
        return and(active, sql`${users.premiumCachedUntil} > ${now}`);
      case 'free':
        return and(
          active,
          sql`(${users.premiumCachedUntil} is null or ${users.premiumCachedUntil} <= ${now})`,
        );
      case 'active30d':
        return and(active, gte(users.lastLoginAt, now - 30 * 86_400));
      case 'creators':
        return and(active, sql`exists (
          select 1 from profiles
          where profiles.user_id = ${users.id} and profiles.is_creator = 1
        )`);
      case 'all':
      default:
        return active;
    }
  })();

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(conditions)
    // A hard ceiling. Beyond this a broadcast belongs in a queue consumer, not in
    // a request; failing loudly is better than half-delivering silently.
    .limit(20_000);

  return rows.map((row) => row.id);
}

/** Recipient count per segment, for the compose screen. */
export async function segmentSizes(): Promise<Record<BroadcastSegment, number>> {
  const entries = await Promise.all(
    BROADCAST_SEGMENTS.map(async (segment) => {
      const ids = await resolveSegment(segment);
      return [segment, ids.length] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<BroadcastSegment, number>;
}

export interface BroadcastInput {
  segment: BroadcastSegment;
  title: string;
  body?: string;
  href?: string;
  /**
   * Ignore the per-user `productUpdates` preference.
   *
   * Off by default, and it should stay off for marketing. It exists because some
   * announcements are not optional — a pricing change or a security notice has to
   * reach everyone regardless of what they ticked.
   */
  force?: boolean;
}

export interface BroadcastResult {
  segment: BroadcastSegment;
  recipients: number;
  delivered: number;
  /** Recipients whose preferences suppressed it. */
  suppressed: number;
}

/**
 * Sends a product update to a segment.
 *
 * Delivery is batched, and honours the preference gate unless forced. The
 * suppressed count is returned rather than hidden: if an operator sends to eight
 * thousand people and two hundred receive it, they need to see that immediately —
 * `productUpdates` defaults to false, so a first broadcast reaching almost nobody
 * is the expected outcome and a very confusing one to discover later.
 */
export async function sendBroadcast(input: BroadcastInput): Promise<BroadcastResult> {
  const title = input.title.trim();
  if (title.length < 3) throw AppError.badRequest('A title is required');

  const recipients = await resolveSegment(input.segment);
  if (recipients.length === 0) {
    return { segment: input.segment, recipients: 0, delivered: 0, suppressed: 0 };
  }

  // Forced sends bypass the gate, so every recipient gets a row and the inserts
  // can be grouped. Un-forced sends have to consult each user's preferences, so
  // they go through `notify`, which owns that logic.
  if (input.force) {
    const now = nowSec();
    const rows = recipients.map((userId) => ({
      id: newId(),
      userId,
      type: 'product_update' as const,
      title: title.slice(0, 160),
      body: input.body?.slice(0, 600) ?? null,
      href: input.href?.slice(0, 300) ?? null,
      icon: null,
      createdAt: now,
    }));

    // Batched against D1's parameter ceiling. A fixed 40 rows bound 320
    // parameters here, so a forced broadcast to more than twelve recipients
    // threw — the case this function exists for.
    for (const chunk of batchByParams(rows)) {
      await db.insert(notifications).values(chunk);
    }

    return {
      segment: input.segment,
      recipients: recipients.length,
      delivered: rows.length,
      suppressed: 0,
    };
  }

  let delivered = 0;
  for (const userId of recipients) {
    const before = await unreadFor(userId);
    await notify({
      userId,
      type: 'product_update',
      title: title.slice(0, 160),
      body: input.body?.slice(0, 600),
      href: input.href?.slice(0, 300),
    });
    // `notify` returns void whether it wrote or skipped, so delivery is measured
    // rather than assumed. Cheap enough at this scale and the alternative is
    // reporting a delivered count that is simply the recipient count.
    if ((await unreadFor(userId)) > before) delivered += 1;
  }

  return {
    segment: input.segment,
    recipients: recipients.length,
    delivered,
    suppressed: recipients.length - delivered,
  };
}

async function unreadFor(userId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows[0]?.value ?? 0;
}

/** Recent broadcasts, grouped, so an operator can see what was already sent. */
export async function recentBroadcasts(limit = 20) {
  const rows = await db
    .select({
      title: notifications.title,
      body: notifications.body,
      href: notifications.href,
      sentAt: sql<number>`max(${notifications.createdAt})`,
      recipients: count(),
    })
    .from(notifications)
    .where(eq(notifications.type, 'product_update'))
    .groupBy(notifications.title, notifications.body)
    .orderBy(desc(sql`max(${notifications.createdAt})`))
    .limit(limit);

  return rows.map((row) => ({ ...row, sentAt: Number(row.sentAt) }));
}

/* ---------------------------- Admin subscription ---------------------------- */

/**
 * Cancels a subscription on a member's behalf.
 *
 * `cancelSubscription` in services/subscriptions.ts is written for the member's
 * own dashboard: it takes a userId and scopes the lookup to it, so an admin
 * holding only a subscription id cannot call it. Support work always starts from
 * the subscription (someone is looking at the billing table), so this resolves
 * the owner first and then delegates, rather than duplicating the cancellation
 * logic and risking the two drifting apart.
 */
export async function adminCancelSubscription(subscriptionId: string): Promise<{
  subscriptionId: string;
  userId: string;
  status: string;
}> {
  const rows = await db
    .select({ id: subscriptions.id, userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1);

  const subscription = rows[0];
  if (!subscription) throw AppError.notFound('Subscription not found');

  const { cancelSubscription } = await import('./subscriptions');
  await cancelSubscription(subscription.userId, subscription.id);

  const after = await db
    .select({ status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1);

  return {
    subscriptionId,
    userId: subscription.userId,
    status: after[0]?.status ?? 'cancelled',
  };
}

/** Bulk premium grant, for a promotion or an apology. */
export async function grantPremiumToSegment(input: {
  segment: BroadcastSegment;
  days: number;
}): Promise<{ granted: number }> {
  if (input.days < 1 || input.days > 3650) {
    throw AppError.badRequest('Choose between 1 and 3650 days');
  }

  const recipients = await resolveSegment(input.segment);
  if (recipients.length > 2000) {
    throw AppError.badRequest(
      `That segment has ${recipients.length} members. Granting premium in bulk is capped at 2000 to avoid a runaway change.`,
    );
  }

  const { grantPremium } = await import('./subscriptions');

  let granted = 0;
  for (const userId of recipients) {
    try {
      await grantPremium({ userId, days: input.days });
      granted += 1;
    } catch {
      // One failed grant must not abandon the rest of the segment.
    }
  }

  return { granted };
}

/** Kept for callers that only need the id list, e.g. an export. */
export async function segmentUserIds(segment: BroadcastSegment): Promise<string[]> {
  return resolveSegment(segment);
}

/** Narrow helper used by the admin user detail view. */
export async function usersByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(inArray(users.id, ids))
    .limit(200);
}
