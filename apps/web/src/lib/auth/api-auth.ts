import type { AuthResult } from '@pd/shared';

import { apiRequestRaw } from '../api-client';

/**
 * Auth calls against the API worker.
 *
 * The API returns the access token in the JSON body and the (rotated) refresh
 * token as a `Set-Cookie` header. Because this runs server-to-server we can
 * read that header directly, which keeps the refresh token out of any payload
 * that browser JavaScript could reach.
 */

export interface TokenPair extends AuthResult {
  refreshToken: string;
}

/** Pulls `pd_refresh` out of one or more Set-Cookie headers. */
function extractRefreshToken(response: Response): string {
  const raw = response.headers.getSetCookie?.() ?? [];
  const headers = raw.length > 0 ? raw : [response.headers.get('set-cookie') ?? ''];
  for (const header of headers) {
    const match = /(?:^|,\s*|;\s*)pd_refresh=([^;]*)/.exec(header);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return '';
}

async function authCall(
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<TokenPair> {
  const { data, response } = await apiRequestRaw<AuthResult>(path, {
    method: 'POST',
    body,
    headers,
  });
  return { ...data, refreshToken: extractRefreshToken(response) };
}

export async function apiRegister(input: {
  name: string;
  email: string;
  password: string;
  forwardedFor?: string | null;
  userAgent?: string | null;
}): Promise<TokenPair> {
  return authCall(
    '/v1/auth/register',
    { name: input.name, email: input.email, password: input.password },
    forwardHeaders(input.forwardedFor, input.userAgent),
  );
}

export async function apiLogin(input: {
  email: string;
  password: string;
  forwardedFor?: string | null;
  userAgent?: string | null;
}): Promise<TokenPair> {
  return authCall(
    '/v1/auth/login',
    { email: input.email, password: input.password },
    forwardHeaders(input.forwardedFor, input.userAgent),
  );
}

/** Exchanges a refresh token for a new pair. Throws if the session is dead. */
export async function apiRefresh(refreshToken: string): Promise<TokenPair> {
  return authCall('/v1/auth/refresh', { refreshToken });
}

export async function apiLogout(accessToken: string | null): Promise<void> {
  if (!accessToken) return;
  try {
    await apiRequestRaw('/v1/auth/logout', { method: 'POST', token: accessToken });
  } catch {
    // A failed revoke must not block clearing the local cookies.
  }
}

/**
 * Passes the real client IP and user agent through to the API so its rate
 * limiter and audit trail see the end user rather than the website worker.
 */
function forwardHeaders(
  forwardedFor?: string | null,
  userAgent?: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;
  if (userAgent) headers['user-agent'] = userAgent;
  return headers;
}
