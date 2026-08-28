import { cache } from 'react';

import { SETTING_KEYS } from './constants';
import { getSession } from './auth/session';
import { ANONYMOUS_VIEWER, type ViewerSnapshot } from '@/components/viewer-provider';
import { FEATURES } from './constants';
import { resolveAccess, type AccessContext } from '@/services/entitlements';
import { unreadCount } from '@/services/notifications';
import { getBoolSetting } from '@/services/settings';

/**
 * Server-side viewer resolution.
 *
 * `getAccess()` is the authorisation source of truth used by pages and route
 * handlers. `getViewerSnapshot()` is the trimmed, non-sensitive projection that
 * gets serialised into the client bundle for rendering only.
 */

export const getAccess = cache(async (): Promise<AccessContext> => {
  const session = await getSession();
  return resolveAccess(session?.user.id ?? null);
});

/** Convenience: can the current viewer read premium prompt bodies? */
export async function canSeePremium(): Promise<boolean> {
  const access = await getAccess();
  return access.features.has(FEATURES.premiumPrompts);
}

export const getViewerSnapshot = cache(async (): Promise<ViewerSnapshot> => {
  const session = await getSession();
  const [access, adsEnabled] = await Promise.all([
    getAccess(),
    getBoolSetting(SETTING_KEYS.adsEnabled, false),
  ]);

  if (!session) {
    return { ...ANONYMOUS_VIEWER, limits: { ...access.limits }, adsEnabled };
  }

  const unread = await unreadCount(session.user.id);

  return {
    isAuthenticated: true,
    userId: session.user.id,
    name: session.user.name,
    username: session.user.username,
    email: session.user.email,
    avatarUrl: session.user.avatarUrl,
    isAdmin: session.user.isAdmin,
    isEditor: session.user.isEditor,
    isPremium: access.isPremium,
    planName: access.planName,
    emailVerified: session.user.emailVerified,
    limits: {
      copiesPerDay: access.limits.copiesPerDay,
      favorites: access.limits.favorites,
      generatorPerDay: access.limits.generatorPerDay,
    },
    unreadNotifications: unread,
    // Premium members never see ads, regardless of the global toggle.
    adsEnabled: adsEnabled && !access.isPremium,
  };
});
