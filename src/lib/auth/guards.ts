import { redirect } from 'next/navigation';

import { AppError } from '../api';
import { getSession, type SessionUser } from './session';

/**
 * Authorization helpers.
 *
 * Every guard resolves roles from the database on the server. Client-supplied
 * role or premium flags are never trusted, and hiding a button in the UI is
 * never treated as an access control mechanism.
 */

/** For API routes: throws 401 when unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw AppError.unauthorized();
  return session.user;
}

/** For API routes: throws 401/403 unless the caller is an administrator. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw AppError.forbidden('Administrator access required');
  return user;
}

/** For API routes: admin or editor may manage content. */
export async function requireEditor(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isEditor) throw AppError.forbidden('Editor access required');
  return user;
}

export async function requireVerifiedUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.emailVerified) {
    throw AppError.forbidden('Please verify your email address to continue');
  }
  return user;
}

/** For server components/pages: redirects instead of throwing. */
export async function requireUserPage(returnTo = '/dashboard'): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return session.user;
}

export async function requireAdminPage(returnTo = '/admin'): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  if (!session.user.isEditor) redirect('/403');
  return session.user;
}

export async function requireStrictAdminPage(returnTo = '/admin'): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  if (!session.user.isAdmin) redirect('/403');
  return session.user;
}

/** Redirects already-authenticated visitors away from login/register. */
export async function requireGuestPage(to = '/dashboard'): Promise<void> {
  const session = await getSession();
  if (session) redirect(to);
}
