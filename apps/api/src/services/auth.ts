import {
  db,
  notificationPreferences,
  profiles,
  roles,
  useKv,
  userRoles,
  users,
  type User,
} from '@pd/db';
import { passwordStrength, type AuthResult } from '@pd/shared';
import { and, eq, sql } from 'drizzle-orm';

import { AppError } from '../lib/errors';
import { config } from '../lib/env';
import { hashPassword, verifyPassword } from '../lib/password';
import { signAccessToken } from '../lib/jwt';
import { newId, newToken, sha256 } from '../lib/crypto';
import { addDays, nowSec } from '../lib/dates';

/**
 * Account lifecycle for the split architecture.
 *
 * Auth is now token-based (cross-origin): a short-lived JWT access token plus a
 * long-lived refresh token stored in KV (revocable). Passwords are bcrypt
 * hashes in D1 — no plaintext is ever stored.
 */

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function roleIdByName(name: string): Promise<string> {
  const rows = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, name)).limit(1);
  if (rows[0]) return rows[0].id;
  const id = newId();
  await db.insert(roles).values({ id, name, description: `${name} role` });
  return id;
}

export async function assignRole(userId: string, roleName: string): Promise<void> {
  const roleId = await roleIdByName(roleName);
  await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing();
}

export async function rolesForUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => r.name);
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.emailNormalized, normalizeEmail(email)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

async function ensureUniqueUsername(base: string): Promise<string> {
  const seed =
    base
      .normalize('NFKD')
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()
      .slice(0, 24) || 'creator';
  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = attempt === 0 ? seed : `${seed}${attempt + 1}`;
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, candidate)).limit(1);
    if (existing.length === 0) return candidate;
  }
  return `${seed}${newToken(4).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password?: string;
  username?: string;
  roleNames?: string[];
  emailVerified?: boolean;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const emailNormalized = normalizeEmail(input.email);
  if (await findUserByEmail(emailNormalized)) {
    throw AppError.conflict('An account with this email already exists');
  }
  if (input.password) {
    const strength = passwordStrength(input.password);
    if (strength.score < 2) {
      throw AppError.badRequest(strength.problems[0] ?? 'Please choose a stronger password');
    }
  }

  const id = newId();
  const username = await ensureUniqueUsername(input.username || input.name || emailNormalized.split('@')[0]!);
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  await db.insert(users).values({
    id,
    email: input.email.trim(),
    emailNormalized,
    name: input.name.trim(),
    username,
    passwordHash,
    emailVerifiedAt: input.emailVerified ? nowSec() : null,
  });
  await db.insert(profiles).values({ userId: id }).onConflictDoNothing();
  await db.insert(notificationPreferences).values({ userId: id }).onConflictDoNothing();
  for (const roleName of input.roleNames ?? ['user']) await assignRole(id, roleName);

  const created = await findUserById(id);
  if (!created) throw AppError.internal('Could not create the account');
  return created;
}

/* ------------------------------- Sessions (KV) ----------------------------- */

interface RefreshRecord {
  userId: string;
  tokenHash: string;
  expiresAt: number;
}

async function issueSession(user: User): Promise<AuthResult & { refreshToken: string }> {
  const roleNames = await rolesForUser(user.id);
  const sid = newId('sess');
  const refreshToken = newToken(32);
  const expiresAt = addDays(nowSec(), config().refreshTokenDays);

  const record: RefreshRecord = { userId: user.id, tokenHash: sha256(refreshToken), expiresAt };
  await useKv().sessions.put(`sess:${sid}`, JSON.stringify(record), {
    expirationTtl: config().refreshTokenDays * 86_400,
  });

  const { token, expiresIn } = await signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    roles: roleNames,
    isAdmin: roleNames.includes('admin'),
    isEditor: roleNames.includes('admin') || roleNames.includes('editor'),
    emailVerified: user.emailVerifiedAt !== null,
    sid,
  });

  return {
    accessToken: token,
    expiresIn,
    refreshToken: `${sid}.${refreshToken}`,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      avatarUrl: user.avatarUrl,
      roles: roleNames,
      isAdmin: roleNames.includes('admin'),
      isEditor: roleNames.includes('admin') || roleNames.includes('editor'),
      emailVerified: user.emailVerifiedAt !== null,
    },
  };
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResult & { refreshToken: string }> {
  const user = await createUser({ ...input });
  return issueSession(user);
}

const MAX_FAILED = 10;
const LOCK_SECONDS = 900;

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<AuthResult & { refreshToken: string }> {
  const generic = AppError.unauthorized('Incorrect email or password');
  const user = await findUserByEmail(input.email);

  if (!user) {
    await verifyPassword(input.password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinv');
    throw generic;
  }
  if (user.status === 'suspended') throw AppError.forbidden('This account has been suspended.');
  if (user.status === 'deleted') throw generic;
  if (user.lockedUntil && user.lockedUntil > nowSec()) {
    const minutes = Math.ceil((user.lockedUntil - nowSec()) / 60);
    throw AppError.rateLimited(`Too many failed attempts. Try again in ${minutes} minute(s).`);
  }

  if (!(await verifyPassword(input.password, user.passwordHash))) {
    const failures = user.failedLoginCount + 1;
    await db
      .update(users)
      .set({
        failedLoginCount: failures,
        lockedUntil: failures >= MAX_FAILED ? nowSec() + LOCK_SECONDS : null,
        updatedAt: nowSec(),
      })
      .where(eq(users.id, user.id));
    throw generic;
  }

  await db
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: nowSec(), updatedAt: nowSec() })
    .where(eq(users.id, user.id));

  return issueSession(user);
}

/** Exchanges a valid refresh token for a fresh access token (rotates refresh). */
export async function refreshSession(refreshToken: string): Promise<AuthResult & { refreshToken: string }> {
  const [sid, raw] = refreshToken.split('.');
  if (!sid || !raw) throw AppError.unauthorized('Invalid refresh token');

  const kv = useKv().sessions;
  const record = await kv.get<RefreshRecord>(`sess:${sid}`, 'json');
  if (!record || record.tokenHash !== sha256(raw) || record.expiresAt < nowSec()) {
    throw AppError.unauthorized('Your session has expired. Please sign in again.');
  }

  const user = await findUserById(record.userId);
  if (!user || user.status !== 'active') throw AppError.unauthorized('Session no longer valid');

  // Rotate: delete the old session, issue a new one.
  await kv.delete(`sess:${sid}`);
  return issueSession(user);
}

export async function logout(sid: string): Promise<void> {
  await useKv().sessions.delete(`sess:${sid}`);
}

export async function updateLastActive(): Promise<void> {
  // no-op placeholder kept for parity with the monolith's session touch
  void sql;
}

export async function ensureRole(userId: string, roleName: string) {
  await assignRole(userId, roleName);
}

export async function hasAnyUser(): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  return rows.length > 0;
}

export { normalizeEmail };
export async function findRoleUsers(roleName: string) {
  return db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(roles.name, roleName)));
}
