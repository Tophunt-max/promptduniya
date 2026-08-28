import { and, count, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { notificationPreferences, notifications } from '@/db/schema';
import { nowSec } from '@/lib/dates';
import { newId } from '@/lib/id';

export type NotificationType =
  | 'welcome'
  | 'security'
  | 'new_premium_prompt'
  | 'new_trending_prompt'
  | 'subscription_activated'
  | 'subscription_expiring'
  | 'subscription_expired'
  | 'payment_success'
  | 'payment_failed'
  | 'product_update';

/** Maps a notification type to the preference column that gates it. */
const PREFERENCE_GATE: Partial<Record<NotificationType, keyof PreferenceRow>> = {
  new_premium_prompt: 'newPremiumPrompts',
  new_trending_prompt: 'newTrendingPrompts',
  subscription_activated: 'subscriptionUpdates',
  subscription_expiring: 'subscriptionUpdates',
  subscription_expired: 'subscriptionUpdates',
  payment_success: 'paymentUpdates',
  payment_failed: 'paymentUpdates',
  product_update: 'productUpdates',
};

interface PreferenceRow {
  newPremiumPrompts: boolean;
  newTrendingPrompts: boolean;
  subscriptionUpdates: boolean;
  paymentUpdates: boolean;
  productUpdates: boolean;
  emailEnabled: boolean;
}

export async function getPreferences(userId: string): Promise<PreferenceRow> {
  const rows = await db
    .select({
      newPremiumPrompts: notificationPreferences.newPremiumPrompts,
      newTrendingPrompts: notificationPreferences.newTrendingPrompts,
      subscriptionUpdates: notificationPreferences.subscriptionUpdates,
      paymentUpdates: notificationPreferences.paymentUpdates,
      productUpdates: notificationPreferences.productUpdates,
      emailEnabled: notificationPreferences.emailEnabled,
    })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  return (
    rows[0] ?? {
      newPremiumPrompts: true,
      newTrendingPrompts: true,
      subscriptionUpdates: true,
      paymentUpdates: true,
      productUpdates: false,
      emailEnabled: true,
    }
  );
}

export async function updatePreferences(
  userId: string,
  patch: Partial<PreferenceRow>,
): Promise<PreferenceRow> {
  const next = { ...patch, updatedAt: nowSec() };
  await db
    .insert(notificationPreferences)
    .values({ userId, ...next })
    .onConflictDoUpdate({ target: notificationPreferences.userId, set: next });
  return getPreferences(userId);
}

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  icon?: string;
  /** Skips the preference check — used for security and billing critical notices. */
  force?: boolean;
}

export async function notify(input: NotifyInput): Promise<void> {
  const gate = PREFERENCE_GATE[input.type];
  if (gate && !input.force) {
    const prefs = await getPreferences(input.userId);
    if (!prefs[gate]) return;
  }

  await db.insert(notifications).values({
    id: newId(),
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    href: input.href ?? null,
    icon: input.icon ?? null,
  });
}

export async function notifyMany(userIds: string[], input: Omit<NotifyInput, 'userId'>) {
  for (const userId of userIds) await notify({ ...input, userId });
}

export async function listNotifications(userId: string, limit = 30) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadCount(userId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows[0]?.value ?? 0;
}

export async function markRead(userId: string, notificationId?: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: nowSec() })
    .where(
      notificationId
        ? and(eq(notifications.userId, userId), eq(notifications.id, notificationId))
        : and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    );
}
