import { AppError, clientIp } from './api';
import { hashIp, hashVisitor } from './crypto';
import { getAccessToken, verifyCsrf } from './auth/session';
import { publicEnv } from './env-public';
import { enforce, type RateLimitName, type RateLimitResult } from './rate-limit';
import { getAccess } from './viewer';
import { rateMultiplier, type AccessContext } from './access';

/**
 * Shared per-request context for API route handlers.
 *
 * Bundles the three things almost every mutating endpoint needs: the resolved
 * access context (server-side entitlements), a pseudonymous visitor id for
 * anonymous quotas, and CSRF + rate-limit enforcement.
 */

export interface RouteContext {
  access: AccessContext;
  visitorHash: string;
  ipHash: string;
  userAgent: string | null;
  /** Raw client IP, forwarded to the API so it rate-limits the real caller. */
  ip: string;
  /** Bearer token to forward to the API, or null for anonymous callers. */
  accessToken: string | null;
  /** Applies a named rate limit, scaled up for authenticated/premium users. */
  limit: (rule: RateLimitName) => Promise<RateLimitResult>;
}

/**
 * Rejects cross-site state-changing requests.
 *
 * Two independent layers: an Origin/Sec-Fetch-Site check, and the double-submit
 * CSRF cookie token. Either one failing blocks the request.
 */
async function assertSameOriginAndCsrf(request: Request): Promise<void> {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    throw AppError.forbidden('Cross-site requests are not allowed');
  }

  const origin = request.headers.get('origin');
  if (origin) {
    const allowed = new Set([publicEnv.siteUrl.replace(/\/$/, '')]);
    const host = request.headers.get('host');
    if (host) {
      allowed.add(`https://${host}`);
      allowed.add(`http://${host}`);
    }
    if (!allowed.has(origin.replace(/\/$/, ''))) {
      throw AppError.forbidden('Request origin is not allowed');
    }
  }

  const csrfOk = await verifyCsrf(request);
  if (!csrfOk) {
    throw AppError.forbidden('Your session token is missing or stale. Please refresh and retry.');
  }
}

export interface ContextOptions {
  /** Set to false for endpoints that legitimately have no session (webhooks). */
  csrf?: boolean;
}

export async function routeContext(
  request: Request,
  options: ContextOptions = {},
): Promise<RouteContext> {
  if (options.csrf !== false) await assertSameOriginAndCsrf(request);

  const ip = clientIp(request);
  const userAgent = request.headers.get('user-agent');
  const [access, accessToken] = await Promise.all([getAccess(), getAccessToken()]);

  const visitorHash = hashVisitor(ip, userAgent);
  const identifier = access.userId ?? visitorHash;
  const multiplier = rateMultiplier(access);

  return {
    access,
    visitorHash,
    ipHash: hashIp(ip),
    userAgent,
    ip,
    accessToken,
    limit: (rule) => enforce(rule, { identifier, multiplier }),
  };
}

/** Lightweight variant for public GET endpoints that only need rate limiting. */
export async function publicContext(request: Request): Promise<RouteContext> {
  return routeContext(request, { csrf: false });
}
