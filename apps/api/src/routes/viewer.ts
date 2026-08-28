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
import {
  listFavorites,
  listLikedPrompts,
  recentCopyActivity,
  removeFavorite,
  userEngagementStats,
  type FavoriteSort,
} from '../services/engagement';
import {
  copyUsage,
  favoriteUsage,
  generatorUsage,
  serializeUsage,
} from '../services/entitlements';

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

/* --------------------------- Personal library --------------------------- */

viewer.get('/favorites', async (c) => {
  const claims = requireUser(c);
  const p = new URL(c.req.url).searchParams;
  const items = await listFavorites(claims.sub, {
    sort: (p.get('sort') as FavoriteSort) ?? undefined,
    q: p.get('q') ?? undefined,
    model: p.get('model') ?? undefined,
    access: p.get('access') ?? undefined,
    limit: Number(p.get('limit')) || undefined,
  });
  return c.json({ ok: true, data: { items } });
});

viewer.delete('/favorites/:promptId', async (c) => {
  const claims = requireUser(c);
  await removeFavorite(claims.sub, c.req.param('promptId'));
  return c.json({ ok: true, data: { removed: true } });
});

viewer.get('/likes', async (c) => {
  const claims = requireUser(c);
  const limitParam = Number(new URL(c.req.url).searchParams.get('limit')) || 60;
  return c.json({ ok: true, data: { items: await listLikedPrompts(claims.sub, limitParam) } });
});

/** Dashboard summary: counts plus the most recent copy activity. */
viewer.get('/activity', async (c) => {
  const claims = requireUser(c);
  const limitParam = Number(new URL(c.req.url).searchParams.get('limit')) || 10;
  const [stats, recent] = await Promise.all([
    userEngagementStats(claims.sub),
    recentCopyActivity(claims.sub, limitParam),
  ]);
  return c.json({ ok: true, data: { stats, recent } });
});

/** Remaining daily allowances, as shown on the dashboard. */
viewer.get('/usage', async (c) => {
  const access = c.get('access');
  const visitorHash = c.get('visitorHash');
  const [copies, generator, saves] = await Promise.all([
    copyUsage(access, visitorHash),
    generatorUsage(access, visitorHash),
    favoriteUsage(access),
  ]);
  return c.json({
    ok: true,
    data: {
      copies: serializeUsage(copies),
      generator: serializeUsage(generator),
      favorites: serializeUsage(saves),
    },
  });
});

export default viewer;
