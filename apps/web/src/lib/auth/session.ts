import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { cache } from 'react';

import type { AccessTokenClaims } from '@pd/shared';
import { env } from '../env';
import { newToken } from '../id';

/**
 * Session handling for the BFF.
 *
 * The website holds no database and no session table. Authentication state is
 * the pair of tokens minted by the API worker:
 *
 *  - `pd_at` — short-lived JWT access token. httpOnly, and verified locally
 *    with the shared `AUTH_SECRET`, so resolving a session costs no network
 *    call. Never readable by JavaScript, so an XSS cannot exfiltrate it.
 *  - `pd_rt` — long-lived refresh token, httpOnly. Swapped for a new access
 *    token by `src/middleware.ts` when the access token is close to expiry.
 *  - `pd_csrf` — readable double-submit token, unchanged from before.
 *
 * Because both credential cookies are httpOnly and same-site, the browser
 * never sees a bearer token; the proxy layer attaches it server-side.
 */

/** Kept under the original name so existing imports continue to work. */
export const SESSION_COOKIE = 'pd_at';
export const REFRESH_COOKIE = 'pd_rt';
export const CSRF_COOKIE = 'pd_csrf';

const ISSUER = 'promptduniya-api';
const AUDIENCE = 'promptduniya';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  emailVerified: boolean;
  status: string;
  roles: string[];
  isAdmin: boolean;
  isEditor: boolean;
  createdAt: number;
}

export interface ActiveSession {
  sessionId: string;
  user: SessionUser;
  expiresAt: number;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env().AUTH_SECRET);
}

function cookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: env().NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSec,
  };
}

/** Access-token claims plus the standard JWT registered claims. */
type VerifiedClaims = AccessTokenClaims & { exp?: number };

/**
 * Verifies an access token's signature and expiry locally.
 *
 * Returns `null` for anything untrusted — expired, tampered, wrong issuer.
 * Exported so the middleware can decide whether a refresh is due.
 */
export async function verifyAccessToken(token: string): Promise<VerifiedClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return payload as unknown as VerifiedClaims;
  } catch {
    return null;
  }
}

function toSession(claims: VerifiedClaims): ActiveSession {
  const roles = Array.isArray(claims.roles) ? claims.roles : [];
  return {
    sessionId: claims.sid,
    expiresAt: claims.exp ?? 0,
    user: {
      id: claims.sub,
      email: claims.email,
      name: claims.name,
      username: claims.username,
      avatarUrl: claims.avatarUrl ?? null,
      bio: claims.bio ?? null,
      emailVerified: Boolean(claims.emailVerified),
      // The API refuses to mint or refresh a token for a non-active account,
      // so holding a valid token is itself proof the account is active.
      status: 'active',
      roles,
      isAdmin: Boolean(claims.isAdmin),
      isEditor: Boolean(claims.isEditor),
      createdAt: claims.createdAt ?? 0,
    },
  };
}

/**
 * Current session for this request, memoised so every server component in a
 * render shares one verification.
 */
export const getSession = cache(async (): Promise<ActiveSession | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifyAccessToken(token);
  return claims ? toSession(claims) : null;
});

/** The raw access token, for forwarding to the API as a Bearer credential. */
export const getAccessToken = cache(async (): Promise<string | null> => {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
});

export async function getRefreshToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(REFRESH_COOKIE)?.value ?? null;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  return (await getSession())?.user ?? null;
}

/**
 * Persists a freshly issued token pair and mints a CSRF token.
 *
 * Only callable from a route handler or server action — Next.js forbids cookie
 * writes during a page render.
 */
export async function establishSession(input: {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime in seconds, as reported by the API. */
  expiresIn: number;
}): Promise<void> {
  const jar = await cookies();
  const refreshMaxAge = env().AUTH_SESSION_DAYS * 86_400;

  // A small safety margin keeps the cookie alive slightly longer than the token
  // so the middleware gets a chance to refresh rather than logging the user out.
  jar.set(SESSION_COOKIE, input.accessToken, cookieOptions(input.expiresIn + 300));
  jar.set(REFRESH_COOKIE, input.refreshToken, cookieOptions(refreshMaxAge));
  jar.set(CSRF_COOKIE, newToken(16), { ...cookieOptions(refreshMaxAge), httpOnly: false });
}

/** Clears all session cookies. The API-side refresh token is revoked separately. */
export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(REFRESH_COOKIE);
  jar.delete(CSRF_COOKIE);
}

/**
 * Validates the double-submit CSRF token for state-changing requests.
 * Same-origin checks run first; this token is the second, independent layer.
 */
export async function verifyCsrf(request: Request): Promise<boolean> {
  const jar = await cookies();
  const cookieToken = jar.get(CSRF_COOKIE)?.value;
  if (!cookieToken) return false;
  const headerToken = request.headers.get('x-csrf-token');
  return Boolean(headerToken) && headerToken === cookieToken;
}
