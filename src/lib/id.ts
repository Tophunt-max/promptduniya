import { randomBytes, randomUUID } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

/**
 * Lexicographically sortable, collision-resistant identifier (ULID-compatible
 * layout: 48-bit timestamp + 80 bits of randomness).
 */
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
    const byteIndex = Math.floor((i * 10) / 16);
    randomPart += ALPHABET[bytes[byteIndex] % 32];
  }

  const id = timePart + randomPart;
  return prefix ? `${prefix}_${id}` : id;
}

/** Opaque, high-entropy token for sessions, email links and API keys. */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function newUuid(): string {
  return randomUUID();
}

/** Short human-friendly reference, e.g. for receipts: PD-7KQ2M9. */
export function newReference(prefix = 'PD'): string {
  const raw = randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${raw}`;
}
