import { Hono } from 'hono';

import { loginSchema, registerSchema } from '@pd/shared';
import { AppError } from '../lib/errors';
import { limit, requireUser, withAccess, type Vars } from '../middleware';
import { loginUser, logout, refreshSession, registerUser } from '../services/auth';
import { getBoolSetting } from '../services/settings';
import { SETTING_KEYS } from '@pd/shared';
import { config } from '../lib/env';

/**
 * Auth endpoints. Tokens are returned in the JSON body (Bearer model). The
 * refresh token is also set as an httpOnly cookie scoped to the parent domain,
 * so the website's SSR layer can use it without JavaScript touching it.
 */
const auth = new Hono<{ Bindings: Record<string, unknown>; Variables: Vars }>();

auth.use('*', withAccess);

function setRefreshCookie(headers: Headers, refreshToken: string) {
  const maxAge = config().refreshTokenDays * 86_400;
  const secure = config().environment === 'production' ? '; Secure' : '';
  // Host-only cookie on the API origin; the web app reads the access token from
  // the body and stores the refresh via this cookie on its own calls.
  headers.append(
    'Set-Cookie',
    `pd_refresh=${refreshToken}; HttpOnly; SameSite=None; Path=/v1/auth${secure}; Max-Age=${maxAge}`,
  );
}

auth.post('/register', async (c) => {
  await limit(c, 'signup');
  const registrationEnabled = await getBoolSetting(SETTING_KEYS.registrationEnabled, true);
  if (!registrationEnabled) throw AppError.forbidden('New registrations are paused right now.');

  const body = registerSchema.parse(await c.req.json());
  const result = await registerUser({ name: body.name, email: body.email, password: body.password });

  setRefreshCookie(c.res.headers, result.refreshToken);
  const { refreshToken: _r, ...safe } = result;
  return c.json({ ok: true, data: safe }, 201);
});

auth.post('/login', async (c) => {
  await limit(c, 'login');
  const body = loginSchema.parse(await c.req.json());
  const result = await loginUser({ email: body.email, password: body.password });

  setRefreshCookie(c.res.headers, result.refreshToken);
  const { refreshToken: _r, ...safe } = result;
  return c.json({ ok: true, data: safe });
});

auth.post('/refresh', async (c) => {
  await limit(c, 'refresh');
  const cookie = c.req.header('cookie') ?? '';
  const fromCookie = /(?:^|;\s*)pd_refresh=([^;]+)/.exec(cookie)?.[1];
  const body = await c.req.json().catch(() => ({}) as { refreshToken?: string });
  const refreshToken = body.refreshToken ?? (fromCookie ? decodeURIComponent(fromCookie) : '');
  if (!refreshToken) throw AppError.unauthorized('No refresh token provided');

  const result = await refreshSession(refreshToken);
  setRefreshCookie(c.res.headers, result.refreshToken);
  const { refreshToken: _r, ...safe } = result;
  return c.json({ ok: true, data: safe });
});

auth.post('/logout', async (c) => {
  const claims = c.get('claims');
  if (claims?.sid) await logout(claims.sid);
  c.res.headers.append(
    'Set-Cookie',
    'pd_refresh=; HttpOnly; SameSite=None; Path=/v1/auth; Max-Age=0',
  );
  return c.json({ ok: true, data: { signedOut: true } });
});

/** Current user + resolved access (limits, premium status) for the frontends. */
auth.get('/me', async (c) => {
  const claims = requireUser(c);
  const access = c.get('access');
  return c.json({
    ok: true,
    data: {
      user: {
        id: claims.sub,
        email: claims.email,
        name: claims.name,
        username: claims.username,
        roles: claims.roles,
        isAdmin: claims.isAdmin,
        isEditor: claims.isEditor,
        emailVerified: claims.emailVerified,
      },
      access: {
        isPremium: access.isPremium,
        planCode: access.planCode,
        planName: access.planName,
        limits: access.limits,
        subscriptionEndsAt: access.subscriptionEndsAt,
      },
    },
  });
});

export default auth;
