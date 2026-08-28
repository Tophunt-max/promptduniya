import bcrypt from 'bcryptjs';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@pd/shared';
import { config } from './env';

/**
 * Password hashing. bcryptjs is pure JS, so it runs on the Workers runtime
 * (this is exactly why the project never used the native `bcrypt` binding).
 */

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (plain.length > PASSWORD_MAX_LENGTH) {
    throw new Error(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }
  return bcrypt.hash(plain, config().bcryptRounds);
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
