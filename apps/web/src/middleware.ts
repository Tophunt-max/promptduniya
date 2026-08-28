// Imported from the submodule so the Edge bundle does not pull in jose's JWE
// encryption path, which references CompressionStream.
import { jwtVerify } from 'jose/jwt/verify';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Silent access-token refresh.
 *
 * Access tokens are deliberately short-lived. A page render cannot write
 * cookies in Next.js, so the swap happens here: when the access token is
 * missing or about to expire and a refresh token is present, we exchange it for
 * a fresh pair, set the new cookies on the response, *and* rewrite the request's
 * own cookie header so the current render already sees the new token.
 *
 * Failure is never fatal — a dead refresh token simply clears the cookies and
 * the visitor continues anonymously.
 */

const ACCESS_COOKIE = 'pd_at';
const REFRESH_COOKIE = 'pd_rt';
const CSRF_COOKIE = 'pd_csrf';

/** Refresh once the token has less than this long to live. */
const REFRESH_WINDOW_SEC = 120;

const ISSUER = 'promptduniya-api';
const AUDIENCE = 'promptduniya';

function apiBaseUrl(): string {
  return (process.env.API_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
}

/** True when the token is absent, invalid, or expiring imminently. */
async function needsRefresh(token: string | undefined): Promise<boolean> {
  if (!token) return true;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false; // Misconfigured; don't churn the API.
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const exp = typeof payload.exp === 'number' ? payload.exp : 0;
    return exp - Math.floor(Date.now() / 1000) < REFRESH_WINDOW_SEC;
  } catch {
    return true;
  }
}

function extractRefreshToken(response: Response): string {
  const raw = response.headers.getSetCookie?.() ?? [];
  const headers = raw.length > 0 ? raw : [response.headers.get('set-cookie') ?? ''];
  for (const header of headers) {
    const match = /(?:^|,\s*|;\s*)pd_refresh=([^;]*)/.exec(header);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return '';
}

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  // Nothing to do for anonymous visitors or still-valid tokens.
  if (!refreshToken || !(await needsRefresh(accessToken))) return NextResponse.next();

  let refreshed: { accessToken: string; expiresIn: number; refreshToken: string } | null = null;
  try {
    const response = await fetch(`${apiBaseUrl()}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
    if (response.ok) {
      const payload = (await response.json()) as {
        ok: boolean;
        data?: { accessToken: string; expiresIn: number };
      };
      if (payload.ok && payload.data) {
        refreshed = {
          accessToken: payload.data.accessToken,
          expiresIn: payload.data.expiresIn,
          refreshToken: extractRefreshToken(response) || refreshToken,
        };
      }
    }
  } catch {
    // Network hiccup — leave cookies untouched and let this request proceed.
    return NextResponse.next();
  }

  // The refresh token is spent or revoked: sign the visitor out cleanly.
  if (!refreshed) {
    const cleared = NextResponse.next({
      request: { headers: strippedCookieHeaders(request) },
    });
    cleared.cookies.delete(ACCESS_COOKIE);
    cleared.cookies.delete(REFRESH_COOKIE);
    cleared.cookies.delete(CSRF_COOKIE);
    return cleared;
  }

  // Make the *current* render see the new token, not just the browser.
  const headers = new Headers(request.headers);
  const jar = new Map<string, string>();
  for (const cookie of request.cookies.getAll()) jar.set(cookie.name, cookie.value);
  jar.set(ACCESS_COOKIE, refreshed.accessToken);
  jar.set(REFRESH_COOKIE, refreshed.refreshToken);
  headers.set(
    'cookie',
    [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
  );

  const response = NextResponse.next({ request: { headers } });
  const secure = process.env.NODE_ENV === 'production';
  const sessionDays = Number(process.env.AUTH_SESSION_DAYS || 30);

  response.cookies.set(ACCESS_COOKIE, refreshed.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: refreshed.expiresIn + 300,
  });
  response.cookies.set(REFRESH_COOKIE, refreshed.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: sessionDays * 86_400,
  });

  return response;
}

function strippedCookieHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  const remaining = request.cookies
    .getAll()
    .filter((c) => c.name !== ACCESS_COOKIE && c.name !== REFRESH_COOKIE && c.name !== CSRF_COOKIE)
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  if (remaining) headers.set('cookie', remaining);
  else headers.delete('cookie');
  return headers;
}

export const config = {
  /**
   * Skip static assets and the webhook path — they never carry a session and
   * must not pay for a refresh round trip.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|api/payments/webhook).*)'],
};
