import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import { config } from './env';

/** SHA-256 hex digest. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** HMAC-SHA256 hex digest. */
export function hmacSha256(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time comparison that never throws on length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Pseudonymised visitor id — never persists a raw IP. */
export function hashVisitor(ip: string | null | undefined, userAgent?: string | null): string {
  return hmacSha256(config().authSecret, `${ip ?? 'unknown'}|${userAgent ?? ''}`).slice(0, 32);
}

export function hashIp(ip: string | null | undefined): string {
  return hmacSha256(config().authSecret, `ip:${ip ?? 'unknown'}`).slice(0, 32);
}

/* -------------------------------- Identifiers ------------------------------- */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Lexicographically sortable ULID-style id. */
export function newId(prefix?: string): string {
  const time = Date.now();
  let timePart = '';
  let t = time;
  for (let i = 0; i < 10; i++) {
    timePart = ALPHABET[t % 32] + timePart;
    t = Math.floor(t / 32);
  }
  const bytes = randomBytes(10);
  let randomPart = '';
  for (let i = 0; i < 16; i++) {
    randomPart += ALPHABET[bytes[Math.floor((i * 10) / 16)]! % 32];
  }
  const id = timePart + randomPart;
  return prefix ? `${prefix}_${id}` : id;
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function newReference(prefix = 'PD'): string {
  return `${prefix}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export function newUuid(): string {
  return randomUUID();
}
