import type { Context, Next } from 'hono';
import type { AccessTokenClaims } from '@pd/shared';

import { AppError } from './lib/errors';
import { verifyAccessToken } from './lib/jwt';
import { hashIp, hashVisitor } from './lib/crypto';
import { resolveAccess, rateMultiplier, type AccessContext } from './services/entitlements';
import { enforce, type RateLimitName } from './lib/rate-limit';

/**
 * Request helpers and guards.
 *
 * Auth is Bearer-token based (cross-origin). `withAccess` resolves the caller's
 * entitlement context from the token's user id — server-side, never trusting a
 * client-supplied role or premium flag.
 */

export interface Vars {
  claims: AccessTokenClaims | null;
  access: AccessContext;
  visitorHash: string;
  ipHash: string;
}

export type AppContext = Context<{ Bindings: Record<string, unknown>; Variables: Vars }>;

export function clientIp(c: AppContext): string {
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-real-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    '127.0.0.1'
  );
}

/** Reads and verifies the Bearer token if present; sets claims + access context. */
export async function withAccess(c: AppContext, next: Next) {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const claims = token ? await verifyAccessToken(token) : null;

  const ip = clientIp(c);
  c.set('claims', claims);
  c.set('visitorHash', hashVisitor(ip, c.req.header('user-agent')));
  c.set('ipHash', hashIp(ip));
  c.set('access', await resolveAccess(claims?.sub ?? null));

  await next();
}

export function requireUser(c: AppContext): AccessTokenClaims {
  const claims = c.get('claims');
  if (!claims) throw AppError.unauthorized();
  return claims;
}

export function requireAdmin(c: AppContext): AccessTokenClaims {
  const claims = requireUser(c);
  if (!claims.isAdmin) throw AppError.forbidden('Administrator access required');
  return claims;
}

export function requireEditor(c: AppContext): AccessTokenClaims {
  const claims = requireUser(c);
  if (!claims.isEditor) throw AppError.forbidden('Editor access required');
  return claims;
}

/** Applies a KV rate limit keyed by user id (or hashed IP for anonymous). */
export async function limit(c: AppContext, rule: RateLimitName): Promise<void> {
  const access = c.get('access');
  const identifier = access.userId ?? c.get('visitorHash');
  await enforce(rule, identifier, rateMultiplier(access));
}
