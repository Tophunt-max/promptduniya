import { Hono } from 'hono';

import { SETTING_KEYS } from '@pd/shared';
import { requireUser, withAccess, type Vars } from '../middleware';
import {
  getPreferences,
  listNotifications,
  markRead,
  unreadCount,
  updatePreferences,
  type PreferenceRow,
} from '../services/notifications';
import { getBoolSetting } from '../services/settings';

/**
 * Per-viewer chrome data and notifications.
 *
 * `/extras` is the one call the website's layout needs on every render, so it
 * bundles the unread badge and the ads toggle into a single round trip.
 */
const viewer = new Hono<{ Bindings: Record<string, unknown>; Variables: Vars }>();
viewer.use('*', withAccess);

viewer.get('/extras', async (c) => {
  const claims = c.get('claims');
  const [adsEnabled, unread] = await Promise.all([
    getBoolSetting(SETTING_KEYS.adsEnabled, false),
    claims ? unreadCount(claims.sub) : Promise.resolve(0),
  ]);
  return c.json({ ok: true, data: { unreadNotifications: unread, adsEnabled } });
});

viewer.get('/notifications', async (c) => {
  const claims = requireUser(c);
  const limitParam = Number(new URL(c.req.url).searchParams.get('limit') ?? 30);
  const [items, unread, preferences] = await Promise.all([
    listNotifications(claims.sub, Number.isFinite(limitParam) ? limitParam : 30),
    unreadCount(claims.sub),
    getPreferences(claims.sub),
  ]);
  return c.json({ ok: true, data: { items, unread, preferences } });
});

viewer.patch('/notifications', async (c) => {
  const claims = requireUser(c);
  const body = (await c.req.json().catch(() => ({}))) as { notificationId?: string };
  await markRead(claims.sub, body.notificationId);
  return c.json({ ok: true, data: { unread: await unreadCount(claims.sub) } });
});

viewer.put('/notifications/preferences', async (c) => {
  const claims = requireUser(c);
  const body = (await c.req.json()) as Partial<PreferenceRow>;
  const allowed: (keyof PreferenceRow)[] = [
    'newPremiumPrompts',
    'newTrendingPrompts',
    'subscriptionUpdates',
    'paymentUpdates',
    'productUpdates',
    'emailEnabled',
  ];
  const patch: Partial<PreferenceRow> = {};
  for (const key of allowed) {
    if (typeof body[key] === 'boolean') patch[key] = body[key];
  }
  return c.json({ ok: true, data: await updatePreferences(claims.sub, patch) });
});

export default viewer;
