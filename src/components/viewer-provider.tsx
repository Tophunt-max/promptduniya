'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Read-only snapshot of the current viewer, passed down from the server layout.
 *
 * This exists purely so client components can render the right UI (badges,
 * remaining quota, sign-in prompts). It is never used for authorisation —
 * every protected action is re-checked on the server.
 */

export interface ViewerSnapshot {
  isAuthenticated: boolean;
  userId: string | null;
  name: string | null;
  username: string | null;
  email: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  isEditor: boolean;
  isPremium: boolean;
  planName: string;
  emailVerified: boolean;
  limits: {
    copiesPerDay: number;
    favorites: number;
    generatorPerDay: number;
  };
  unreadNotifications: number;
  adsEnabled: boolean;
}

export const ANONYMOUS_VIEWER: ViewerSnapshot = {
  isAuthenticated: false,
  userId: null,
  name: null,
  username: null,
  email: null,
  avatarUrl: null,
  isAdmin: false,
  isEditor: false,
  isPremium: false,
  planName: 'Guest',
  emailVerified: false,
  limits: { copiesPerDay: 3, favorites: 0, generatorPerDay: 3 },
  unreadNotifications: 0,
  adsEnabled: false,
};

const ViewerContext = createContext<ViewerSnapshot>(ANONYMOUS_VIEWER);

export function ViewerProvider({
  viewer,
  children,
}: {
  viewer: ViewerSnapshot;
  children: ReactNode;
}) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer(): ViewerSnapshot {
  return useContext(ViewerContext);
}
