import { AppError } from '@/lib/api';
import { apiRequest } from '@/lib/api-client';
import { apiLogin, apiRegister } from '@/lib/auth/api-auth';
import { establishSession, getAccessToken } from '@/lib/auth/session';

/**
 * Account lifecycle, delegated to the API worker.
 *
 * The website holds no password hashes and no user table — it forwards
 * credentials once, over the internal transport, and stores the resulting token
 * pair in httpOnly cookies. Exported signatures are unchanged from the monolith
 * so every existing route handler keeps working.
 */

/** The subset of a user row the website actually renders. */
export interface User {
  id: string;
  email: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  emailVerified: boolean;
  createdAt: number;
}

export interface RegisterResult {
  user: User;
  requiresVerification: boolean;
}

interface AuthUserPayload {
  id: string;
  email: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  roles: string[];
  isAdmin: boolean;
  isEditor: boolean;
  emailVerified: boolean;
}

function toUser(payload: AuthUserPayload, createdAt = 0): User {
  return {
    id: payload.id,
    email: payload.email,
    name: payload.name,
    username: payload.username,
    avatarUrl: payload.avatarUrl ?? null,
    bio: null,
    emailVerified: payload.emailVerified,
    createdAt,
  };
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  username?: string;
  userAgent?: string | null;
  ipHash?: string | null;
  /** Real client IP, forwarded so the API rate-limits the visitor not the worker. */
  ip?: string | null;
}): Promise<RegisterResult> {
  const pair = await apiRegister({
    name: input.name,
    email: input.email,
    password: input.password,
    forwardedFor: input.ip,
    userAgent: input.userAgent,
  });

  await establishSession({
    accessToken: pair.accessToken,
    refreshToken: pair.refreshToken,
    expiresIn: pair.expiresIn,
  });

  return {
    user: toUser(pair.user as AuthUserPayload),
    // The API applies the verification setting itself; an unverified account is
    // still signed in, with gated features checking `emailVerified`.
    requiresVerification: !pair.user.emailVerified,
  };
}

export async function loginUser(input: {
  email: string;
  password: string;
  userAgent?: string | null;
  ipHash?: string | null;
  ip?: string | null;
}): Promise<User> {
  const pair = await apiLogin({
    email: input.email,
    password: input.password,
    forwardedFor: input.ip,
    userAgent: input.userAgent,
  });

  await establishSession({
    accessToken: pair.accessToken,
    refreshToken: pair.refreshToken,
    expiresIn: pair.expiresIn,
  });

  return toUser(pair.user as AuthUserPayload);
}

/* ------------------- Email verification & password reset ------------------ */

export async function verifyEmail(token: string): Promise<void> {
  await apiRequest('/v1/auth/verify-email', { method: 'POST', body: { token } });
}

/** Re-sends the verification link to the signed-in user. */
export async function issueVerificationEmail(user: Pick<User, 'id'> | null): Promise<void> {
  void user;
  const token = await getAccessToken();
  if (!token) throw AppError.unauthorized();
  await apiRequest('/v1/auth/verify-email', { method: 'PUT', token });
}

/** Resolves successfully whether or not the address exists (no enumeration). */
export async function requestPasswordReset(email: string): Promise<void> {
  await apiRequest('/v1/auth/forgot-password', { method: 'POST', body: { email } });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiRequest('/v1/auth/reset-password', {
    method: 'POST',
    body: { token, password: newPassword },
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  void userId; // The API derives the user from the bearer token.
  const token = await getAccessToken();
  if (!token) throw AppError.unauthorized();
  await apiRequest('/v1/auth/password', {
    method: 'PUT',
    token,
    body: { currentPassword, newPassword },
  });
}

/* -------------------------------- Profile -------------------------------- */

export interface ProfileDetail extends User {
  location: string | null;
  website: string | null;
  instagram: string | null;
  youtube: string | null;
}

export async function getProfile(): Promise<ProfileDetail> {
  const token = await getAccessToken();
  if (!token) throw AppError.unauthorized();
  return apiRequest<ProfileDetail>('/v1/auth/profile', { token });
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
  void userId;
  const token = await getAccessToken();
  if (!token) throw AppError.unauthorized();
  await apiRequest('/v1/auth/profile', { method: 'PATCH', token, body: input });
}

/**
 * Current user, for the handful of routes that only need identity.
 *
 * `userId` is accepted for signature compatibility but ignored — a caller can
 * only ever read its own account through the bearer token, which is the correct
 * security boundary.
 */
export async function findUserById(userId: string): Promise<User | null> {
  void userId;
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const profile = await apiRequest<ProfileDetail>('/v1/auth/profile', { token });
    return profile;
  } catch {
    return null;
  }
}
