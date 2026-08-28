import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { env } from './env';

/** SHA-256 hex digest. Used for storing session/verification tokens. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** HMAC-SHA256 hex digest. */
export function hmacSha256(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time string comparison that never throws on length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Still perform a comparison to keep timing roughly constant.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Pseudonymised visitor identifier. We never persist raw IP addresses; a
 * keyed hash lets us de-duplicate views while remaining privacy-friendly.
 */
export function hashVisitor(ip: string | null | undefined, userAgent?: string | null): string {
  const secret = env().AUTH_SECRET;
  return hmacSha256(secret, `${ip ?? 'unknown'}|${userAgent ?? ''}`).slice(0, 32);
}

export function hashIp(ip: string | null | undefined): string {
  return hmacSha256(env().AUTH_SECRET, `ip:${ip ?? 'unknown'}`).slice(0, 32);
}
