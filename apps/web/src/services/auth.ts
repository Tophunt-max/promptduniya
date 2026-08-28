import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  authTokens,
  notificationPreferences,
  profiles,
  roles,
  userRoles,
  users,
  type User,
} from '@/db/schema';
import { AppError } from '@/lib/api';
import { hashPassword, passwordStrength, verifyPassword } from '@/lib/auth/password';
import { createSession, revokeAllSessions } from '@/lib/auth/session';
import { sha256 } from '@/lib/crypto';
import { nowSec } from '@/lib/dates';
import { publicEnv } from '@/lib/env';
import { newId, newToken } from '@/lib/id';
import { slugify } from '@/lib/utils';
import { SETTING_KEYS } from '@/lib/constants';
import { notify } from './notifications';
import { sendPasswordResetEmail, sendVerificationEmail } from './mailer';
import { getBoolSetting } from './settings';

/**
 * Account lifecycle. All password material is hashed with bcrypt before it ever
 * reaches the database, and failed logins are counted so an account can be
 * temporarily locked independently of IP-based rate limiting.
 */

const MAX_FAILED_LOGINS = 10;
const LOCK_SECONDS = 900; // 15 minutes
const VERIFY_TOKEN_TTL = 86_400; // 24 hours
const RESET_TOKEN_TTL = 3_600; // 60 minutes

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function ensureUniqueUsername(base: string): Promise<string> {
  const seed = slugify(base).replace(/-/g, '_').slice(0, 24) || 'creator';
  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = attempt === 0 ? seed : `${seed}${attempt + 1}`;
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
  }
  return `${seed}_${newToken(4).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
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

export async function removeRole(userId: string, roleName: string): Promise<void> {
  const roleId = await roleIdByName(roleName);
  await db.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
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

export interface CreateUserInput {
  name: string;
  email: string;
  password?: string;
  username?: string;
  roleNames?: string[];
  emailVerified?: boolean;
  oauth?: { provider: string; subject: string; avatarUrl?: string | null };
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const emailNormalized = normalizeEmail(input.email);

  const existing = await findUserByEmail(emailNormalized);
  if (existing) throw AppError.conflict('An account with this email already exists');

  if (input.password) {
    const strength = passwordStrength(input.password);
    if (strength.score < 2) {
      throw AppError.badRequest(
        strength.problems[0] ?? 'Please choose a stronger password',
      );
    }
  }

  const id = newId();
  const username = input.username
    ? await ensureUniqueUsername(input.username)
    : await ensureUniqueUsername(input.name || emailNormalized.split('@')[0]!);

  const passwordHash = input.password ? await hashPassword(input.password) : null;

  await db.insert(users).values({
    id,
    email: input.email.trim(),
    emailNormalized,
    name: input.name.trim(),
    username,
    passwordHash,
    emailVerifiedAt: input.emailVerified ? nowSec() : null,
    oauthProvider: input.oauth?.provider ?? null,
    oauthSubject: input.oauth?.subject ?? null,
    avatarUrl: input.oauth?.avatarUrl ?? null,
  });

  await db.insert(profiles).values({ userId: id }).onConflictDoNothing();
  await db.insert(notificationPreferences).values({ userId: id }).onConflictDoNothing();

  for (const roleName of input.roleNames ?? ['user']) {
    await assignRole(id, roleName);
  }

  const created = await findUserById(id);
  if (!created) throw AppError.internal('Could not create the account');
  return created;
}

export interface RegisterResult {
  user: User;
  requiresVerification: boolean;
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  username?: string;
  userAgent?: string | null;
  ipHash?: string | null;
}): Promise<RegisterResult> {
  const registrationEnabled = await getBoolSetting(SETTING_KEYS.registrationEnabled, true);
  if (!registrationEnabled) {
    throw AppError.forbidden('New registrations are paused right now. Please try again later.');
  }

  const user = await createUser({
    name: input.name,
    email: input.email,
    password: input.password,
    username: input.username,
  });

  const requiresVerification = await getBoolSetting(SETTING_KEYS.requireEmailVerification, false);
  await issueVerificationEmail(user);

  // Sign the user in immediately; gated features still check `emailVerified`.
  await createSession({ userId: user.id, userAgent: input.userAgent, ipHash: input.ipHash });

  await notify({
    userId: user.id,
    type: 'welcome',
    title: 'Welcome to promptduniya',
    body: 'Explore trending prompts, save your favourites and generate your own in seconds.',
    href: '/explore',
  });

  return { user, requiresVerification };
}

export async function loginUser(input: {
  email: string;
  password: string;
  userAgent?: string | null;
  ipHash?: string | null;
}): Promise<User> {
  const genericError = AppError.unauthorized('Incorrect email or password');
  const user = await findUserByEmail(input.email);

  if (!user) {
    // Equalise timing between "no such user" and "wrong password".
    await verifyPassword(input.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    throw genericError;
  }

  if (user.status === 'suspended') {
    throw AppError.forbidden('This account has been suspended. Contact support for help.');
  }
  if (user.status === 'deleted') throw genericError;

  if (user.lockedUntil && user.lockedUntil > nowSec()) {
    const minutes = Math.ceil((user.lockedUntil - nowSec()) / 60);
    throw AppError.rateLimited(
      `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    );
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    const failures = user.failedLoginCount + 1;
    await db
      .update(users)
      .set({
        failedLoginCount: failures,
        lockedUntil: failures >= MAX_FAILED_LOGINS ? nowSec() + LOCK_SECONDS : null,
        updatedAt: nowSec(),
      })
      .where(eq(users.id, user.id));
    throw genericError;
  }

  await db
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: nowSec(), updatedAt: nowSec() })
    .where(eq(users.id, user.id));

  await createSession({ userId: user.id, userAgent: input.userAgent, ipHash: input.ipHash });
  return user;
}

/* ------------------------------ Token helpers ----------------------------- */

async function issueToken(
  userId: string,
  type: 'email_verify' | 'password_reset',
  ttlSeconds: number,
): Promise<string> {
  // Invalidate outstanding tokens of the same type first.
  await db
    .update(authTokens)
    .set({ consumedAt: nowSec() })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.type, type), isNull(authTokens.consumedAt)));

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

async function consumeToken(
  token: string,
  type: 'email_verify' | 'password_reset',
): Promise<string> {
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
  if (row.expiresAt < nowSec()) throw AppError.badRequest('This link has expired. Request a new one.');

  await db.update(authTokens).set({ consumedAt: nowSec() }).where(eq(authTokens.id, row.id));
  return row.userId;
}

export async function issueVerificationEmail(user: User): Promise<void> {
  if (user.emailVerifiedAt) return;
  const token = await issueToken(user.id, 'email_verify', VERIFY_TOKEN_TTL);
  const link = `${publicEnv.siteUrl}/verify-email?token=${encodeURIComponent(token)}`;
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
  const link = `${publicEnv.siteUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await sendPasswordResetEmail(user.email, user.name, link);
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

export async function updateProfile(
  userId: string,
  input: {
    name?: string;
    username?: string;
    bio?: string;
    avatarUrl?: string;
    location?: string;
    website?: string;
    instagram?: string;
    youtube?: string;
  },
): Promise<void> {
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
    .insert(profiles)
    .values({ userId, ...profilePatch })
    .onConflictDoUpdate({ target: profiles.userId, set: profilePatch });
}
