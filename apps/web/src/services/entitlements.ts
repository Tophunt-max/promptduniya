import { apiRequest } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import type { AccessContext, UsageStatus } from '@/lib/access';

/**
 * Usage allowances, read from the API.
 *
 * Entitlements are resolved server-side by the API worker — the website only
 * reports what it is told. The `access` argument is accepted for signature
 * compatibility but the API derives the real identity from the bearer token, so
 * a tampered client context cannot inflate a quota.
 */

export type { AccessContext, PlanLimits, UsageStatus } from '@/lib/access';
export { rateMultiplier, hydrateAccess, ANONYMOUS_ACCESS } from '@/lib/access';

interface UsageResponse {
  copies: UsageStatus;
  generator: UsageStatus;
  favorites: UsageStatus;
}

const EMPTY: UsageStatus = {
  used: 0,
  limit: 0,
  remaining: 0,
  unlimited: false,
  allowed: false,
};

async function allUsage(): Promise<UsageResponse> {
  try {
    return await apiRequest<UsageResponse>('/v1/viewer/usage', {
      token: await getAccessToken(),
    });
  } catch (error) {
    console.error('[entitlements] usage lookup failed:', error);
    return { copies: EMPTY, generator: EMPTY, favorites: EMPTY };
  }
}

export async function copyUsage(
  _access?: AccessContext,
  _visitorHash?: string | null,
): Promise<UsageStatus> {
  return (await allUsage()).copies;
}

export async function generatorUsage(
  _access?: AccessContext,
  _visitorHash?: string | null,
): Promise<UsageStatus> {
  return (await allUsage()).generator;
}

export async function favoriteUsage(_access?: AccessContext): Promise<UsageStatus> {
  return (await allUsage()).favorites;
}
