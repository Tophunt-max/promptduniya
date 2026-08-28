import { cache } from 'react';
import type { SerializedAccess } from '@pd/shared';

import { ANONYMOUS_VIEWER, type ViewerSnapshot } from '@/components/viewer-provider';
import { apiRequest } from './api-client';
import { ANONYMOUS_ACCESS, hydrateAccess, type AccessContext } from './access';
import { getAccessToken, getSession } from './auth/session';
import { FEATURES } from './constants';

/**
 * Server-side viewer resolution.
 *
 * `getAccess()` is the authorisation source of truth for pages and route
 * handlers, and it is answered by the API worker — the website never derives
 * entitlements locally, so a compromised frontend cannot grant itself premium.
 * `getViewerSnapshot()` is the trimmed, non-sensitive projection serialised into
 * the client bundle for rendering only.
 */

interface AccessResponse {
  access: SerializedAccess;
  user: {
    id: string;
    email: string;
    name: string;
    username: string;
    avatarUrl: string | null;
    bio: string | null;
    roles: string[];
    isAdmin: boolean;
    isEditor: boolean;
    emailVerified: boolean;
    createdAt: number;
  } | null;
}

/**
 * Entitlements for the current request, memoised so the many server components
 * in one render share a single API call.
 */
export const getAccess = cache(async (): Promise<AccessContext> => {
  const token = await getAccessToken();
  try {
    const payload = await apiRequest<AccessResponse>('/v1/auth/access', { token });
    return hydrateAccess(payload.access);
  } catch (error) {
    // Never hard-fail a page render on an entitlement lookup: degrade to guest
    // access, which is the least-privileged outcome.
    console.error('[viewer] access lookup failed:', error);
    return { ...ANONYMOUS_ACCESS, features: new Set<string>() };
  }
});

/** Convenience: can the current viewer read premium prompt bodies? */
export async function canSeePremium(): Promise<boolean> {
  const access = await getAccess();
  return access.features.has(FEATURES.premiumPrompts);
}

interface ViewerExtras {
  unreadNotifications: number;
  adsEnabled: boolean;
}

export const getViewerSnapshot = cache(async (): Promise<ViewerSnapshot> => {
  const [session, access, extras] = await Promise.all([
    getSession(),
    getAccess(),
    viewerExtras(),
  ]);

  if (!session) {
    return {
      ...ANONYMOUS_VIEWER,
      limits: { ...access.limits },
      adsEnabled: extras.adsEnabled,
    };
  }

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
    unreadNotifications: extras.unreadNotifications,
    // Premium members never see ads, regardless of the global toggle.
    adsEnabled: extras.adsEnabled && !access.isPremium,
  };
});

/** Chrome-only data (unread badge, ads toggle) — a failure must not break layout. */
const viewerExtras = cache(async (): Promise<ViewerExtras> => {
  const token = await getAccessToken();
  try {
    return await apiRequest<ViewerExtras>('/v1/viewer/extras', { token });
  } catch (error) {
    console.error('[viewer] extras lookup failed:', error);
    return { unreadNotifications: 0, adsEnabled: false };
  }
});
