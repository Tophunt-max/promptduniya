import { and, eq, gt, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { cache } from 'react';

import { db } from '@/db';
import { roles, sessions, userRoles, users } from '@/db/schema';
import { sha256 } from '../crypto';
import { addDays, nowSec } from '../dates';
import { env } from '../env';
import { newId, newToken } from '../id';

export const SESSION_COOKIE = 'pd_session';
export const CSRF_COOKIE = 'pd_csrf';

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

function cookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: env().NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSec,
  };
}

/** Issues a new session, sets the cookies and returns the raw token. */
export async function createSession(input: {
  userId: string;
  userAgent?: string | null;
  ipHash?: string | null;
}): Promise<{ token: string; expiresAt: number }> {
  const days = env().AUTH_SESSION_DAYS;
  const token = newToken(32);
  const expiresAt = addDays(nowSec(), days);

  await db.insert(sessions).values({
    id: newId(),
    userId: input.userId,
    tokenHash: sha256(token),
    userAgent: input.userAgent?.slice(0, 300) ?? null,
    ipHash: input.ipHash ?? null,
    expiresAt,
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(days * 86_400));
  // Double-submit CSRF token: readable by JS so the client can echo it back.
  jar.set(CSRF_COOKIE, newToken(16), {
    ...cookieOptions(days * 86_400),
    httpOnly: false,
  });

  return { token, expiresAt };
}

/** Revokes the current session and clears cookies. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    await db
      .update(sessions)
      .set({ revokedAt: nowSec() })
      .where(eq(sessions.tokenHash, sha256(token)));
  }

  jar.delete(SESSION_COOKIE);
  jar.delete(CSRF_COOKIE);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: nowSec() }).where(eq(sessions.userId, userId));
}

async function loadSession(token: string): Promise<ActiveSession | null> {
  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      id: users.id,
      email: users.email,
      name: users.name,
      username: users.username,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      emailVerifiedAt: users.emailVerifiedAt,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, sha256(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, nowSec()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row || row.status !== 'active') return null;

  const roleRows = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, row.id));

  const roleNames = roleRows.map((r) => r.name);

  return {
    sessionId: row.sessionId,
    expiresAt: row.expiresAt,
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      username: row.username,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      emailVerified: row.emailVerifiedAt !== null,
      status: row.status,
      roles: roleNames,
      isAdmin: roleNames.includes('admin'),
      isEditor: roleNames.includes('admin') || roleNames.includes('editor'),
      createdAt: row.createdAt,
    },
  };
}

/**
 * Current session for this request. `cache()` de-duplicates the DB lookup
 * across every server component and route handler in the same render.
 */
export const getSession = cache(async (): Promise<ActiveSession | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await loadSession(token);
  } catch (error) {
    console.error('[auth] session lookup failed:', error);
    return null;
  }
});

export async function getCurrentUser(): Promise<SessionUser | null> {
  return (await getSession())?.user ?? null;
}

/**
 * Validates the double-submit CSRF token for state-changing requests.
 * Same-origin checks are handled first; the token is the second layer.
 */
export async function verifyCsrf(request: Request): Promise<boolean> {
  const jar = await cookies();
  const cookieToken = jar.get(CSRF_COOKIE)?.value;
  if (!cookieToken) return false;
  const headerToken = request.headers.get('x-csrf-token');
  return Boolean(headerToken) && headerToken === cookieToken;
}
