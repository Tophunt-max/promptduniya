import bcrypt from 'bcryptjs';

import { env } from '../env';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password-strength';

/**
 * Password hashing (server only).
 *
 * Passwords are stored exclusively as bcrypt hashes. There is deliberately no
 * function anywhere in this codebase that can recover a plaintext password.
 * Strength rules live in `./password-strength`, which is shared with the client.
 */

export {
  MIN_ACCEPTABLE_SCORE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordStrength,
  type PasswordStrength,
} from './password-strength';

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (plain.length > PASSWORD_MAX_LENGTH) {
    throw new Error(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }
  return bcrypt.hash(plain, env().AUTH_BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
