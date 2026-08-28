import type { SerializedAccess } from '@pd/shared';

/**
 * The viewer's entitlement context.
 *
 * Resolved entirely by the API worker — the website never computes
 * entitlements itself, it only carries the server's answer. Kept in `lib/` (not
 * `services/`) so it has no data-layer dependency.
 */

export interface PlanLimits {
  copiesPerDay: number;
  favorites: number;
  generatorPerDay: number;
  [key: string]: number;
}

export interface AccessContext {
  userId: string | null;
  isAuthenticated: boolean;
  isPremium: boolean;
  planCode: string;
  planName: string;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  subscriptionEndsAt: number | null;
  autoRenew: boolean;
  limits: PlanLimits;
  /** Rehydrated from the wire array; `has()` is the only access pattern used. */
  features: Set<string>;
}

/** Usage of a metered allowance, as reported by the API. */
export interface UsageStatus {
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
  allowed: boolean;
}

export const ANONYMOUS_ACCESS: AccessContext = {
  userId: null,
  isAuthenticated: false,
  isPremium: false,
  planCode: 'anonymous',
  planName: 'Guest',
  subscriptionId: null,
  subscriptionStatus: null,
  subscriptionEndsAt: null,
  autoRenew: false,
  limits: { copiesPerDay: 3, favorites: 0, generatorPerDay: 3 },
  features: new Set<string>(),
};

/** Turns the JSON payload back into the runtime shape (array → Set). */
export function hydrateAccess(payload: SerializedAccess): AccessContext {
  const limits = payload.limits ?? {};
  return {
    userId: payload.userId,
    isAuthenticated: payload.isAuthenticated,
    isPremium: payload.isPremium,
    planCode: payload.planCode,
    planName: payload.planName,
    subscriptionId: payload.subscriptionId,
    subscriptionStatus: payload.subscriptionStatus,
    subscriptionEndsAt: payload.subscriptionEndsAt,
    autoRenew: payload.autoRenew,
    limits: {
      copiesPerDay: limits.copiesPerDay ?? 0,
      favorites: limits.favorites ?? 0,
      generatorPerDay: limits.generatorPerDay ?? 0,
      ...limits,
    },
    features: new Set(payload.features ?? []),
  };
}

/**
 * Rate-limit budget multiplier. Premium members get the most headroom, signed-in
 * users more than guests.
 */
export function rateMultiplier(access: AccessContext): number {
  if (access.isPremium) return 4;
  if (access.isAuthenticated) return 2;
  return 1;
}
