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
  /** When this session was issued; compared against the revocation watermark. */
  issuedAt: number;
}

async function issueSession(user: User): Promise<AuthResult & { refreshToken: string }> {
  const roleNames = await rolesForUser(user.id);
  const sid = newId('sess');
  const refreshToken = newToken(32);
  const expiresAt = addDays(nowSec(), config().refreshTokenDays);

  const record: RefreshRecord = {
    userId: user.id,
    tokenHash: sha256(refreshToken),
    expiresAt,
    issuedAt: nowSec(),
  };
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
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    createdAt: user.createdAt,
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

  // A password reset (or forced sign-out) sets a revocation watermark; any
  // session issued before it is dead even though its token is still present.
  const watermark = Number((await kv.get(`revoked:${record.userId}`)) ?? 0);
  if (watermark && (record.issuedAt ?? 0) <= watermark) {
    await kv.delete(`sess:${sid}`);
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


/* ==================== Email verification & password reset ================= */

import { authTokens, profiles as profilesTable } from '@pd/db';
import { isNull } from 'drizzle-orm';

import { notify } from './notifications';
import { sendPasswordResetEmail, sendVerificationEmail } from './mailer';

const VERIFY_TOKEN_TTL = 86_400; // 24 hours
const RESET_TOKEN_TTL = 3_600; // 60 minutes

type TokenType = 'email_verify' | 'password_reset';

/** Issues a single-use token, invalidating any outstanding ones of the same type. */
async function issueToken(userId: string, type: TokenType, ttlSeconds: number): Promise<string> {
  await db
    .update(authTokens)
    .set({ consumedAt: nowSec() })
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.type, type),
        isNull(authTokens.consumedAt),
      ),
    );

  const token = newToken(32);
  await db.insert(authTokens).values({
    id: newId(),
    userId,
    type,
    tokenHash: sha256(token),
    expiresAt: nowSec() + ttlSeconds,
  });
  return token;
}

/** Validates and burns a token, returning the user it belonged to. */
async function consumeToken(token: string, type: TokenType): Promise<string> {
  const rows = await db
    .select({ id: authTokens.id, userId: authTokens.userId, expiresAt: authTokens.expiresAt })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, sha256(token)),
        eq(authTokens.type, type),
        isNull(authTokens.consumedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) throw AppError.badRequest('This link is invalid or has already been used');
  if (row.expiresAt < nowSec()) {
    throw AppError.badRequest('This link has expired. Request a new one.');
  }

  await db.update(authTokens).set({ consumedAt: nowSec() }).where(eq(authTokens.id, row.id));
  return row.userId;
}

export async function issueVerificationEmail(user: User): Promise<void> {
  if (user.emailVerifiedAt) return;
  const token = await issueToken(user.id, 'email_verify', VERIFY_TOKEN_TTL);
  const link = `${config().webOrigin}/verify-email?token=${encodeURIComponent(token)}`;
  await sendVerificationEmail(user.email, user.name, link);
}

export async function verifyEmail(token: string): Promise<void> {
  const userId = await consumeToken(token, 'email_verify');
  await db
    .update(users)
    .set({ emailVerifiedAt: nowSec(), updatedAt: nowSec() })
    .where(eq(users.id, userId));
}

/**
 * Always resolves successfully, whether or not the address exists, so the
 * endpoint cannot be used to enumerate registered emails.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await findUserByEmail(email);
  if (!user || user.status !== 'active') return;

  const token = await issueToken(user.id, 'password_reset', RESET_TOKEN_TTL);
  const link = `${config().webOrigin}/reset-password?token=${encodeURIComponent(token)}`;
  await sendPasswordResetEmail(user.email, user.name, link);
}

/** Revokes every refresh session for a user by bumping a KV generation marker. */
export async function revokeAllSessions(userId: string): Promise<void> {
  // Refresh tokens live in KV keyed by session id, so there is no cheap way to
  // enumerate a user's sessions. Instead we record a revocation watermark; any
  // refresh issued before it is rejected on use.
  await useKv().sessions.put(`revoked:${userId}`, String(nowSec()), {
    expirationTtl: config().refreshTokenDays * 86_400,
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const strength = passwordStrength(newPassword);
  if (strength.score < 2) {
    throw AppError.badRequest(strength.problems[0] ?? 'Please choose a stronger password');
  }

  const userId = await consumeToken(token, 'password_reset');
  const passwordHash = await hashPassword(newPassword);

  await db
    .update(users)
    .set({ passwordHash, failedLoginCount: 0, lockedUntil: null, updatedAt: nowSec() })
    .where(eq(users.id, userId));

  // A password change invalidates every existing session.
  await revokeAllSessions(userId);

  await notify({
    userId,
    type: 'security',
    title: 'Password changed',
    body: 'Your password was updated and all other sessions were signed out.',
    href: '/dashboard/settings',
    force: true,
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await findUserById(userId);
  if (!user) throw AppError.notFound('Account not found');

  if (user.passwordHash) {
    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) throw AppError.badRequest('Your current password is incorrect');
  }

  const strength = passwordStrength(newPassword);
  if (strength.score < 2) {
    throw AppError.badRequest(strength.problems[0] ?? 'Please choose a stronger password');
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: nowSec() })
    .where(eq(users.id, userId));
}

export interface ProfileInput {
  name?: string;
  username?: string;
  bio?: string;
  avatarUrl?: string;
  location?: string;
  website?: string;
  instagram?: string;
  youtube?: string;
}

export async function updateProfile(userId: string, input: ProfileInput): Promise<void> {
  if (input.username) {
    const taken = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, input.username), sql`${users.id} <> ${userId}`))
      .limit(1);
    if (taken.length > 0) throw AppError.conflict('That username is already taken');
  }

  const userPatch: Record<string, unknown> = { updatedAt: nowSec() };
  if (input.name !== undefined) userPatch.name = input.name;
  if (input.username !== undefined) userPatch.username = input.username;
  if (input.bio !== undefined) userPatch.bio = input.bio;
  if (input.avatarUrl !== undefined) userPatch.avatarUrl = input.avatarUrl || null;

  await db.update(users).set(userPatch).where(eq(users.id, userId));

  const profilePatch: Record<string, unknown> = { updatedAt: nowSec() };
  if (input.location !== undefined) profilePatch.location = input.location;
  if (input.website !== undefined) profilePatch.website = input.website || null;
  if (input.instagram !== undefined) profilePatch.instagram = input.instagram || null;
  if (input.youtube !== undefined) profilePatch.youtube = input.youtube || null;

  await db
    .insert(profilesTable)
    .values({ userId, ...profilePatch })
    .onConflictDoUpdate({ target: profilesTable.userId, set: profilePatch });
}

/** Full profile for the account page: user row + extended profile fields. */
export async function getProfile(userId: string) {
  const [user, profileRows] = await Promise.all([
    findUserById(userId),
    db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1),
  ]);
  if (!user) throw AppError.notFound('Account not found');
  const profile = profileRows[0] ?? null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt,
    location: profile?.location ?? null,
    website: profile?.website ?? null,
    instagram: profile?.instagram ?? null,
    youtube: profile?.youtube ?? null,
  };
}
