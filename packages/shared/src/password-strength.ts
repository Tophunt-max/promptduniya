import { PASSWORD_MIN_LENGTH } from './password-bounds';

/**
 * Password strength heuristic — pure and dependency-free, so the same rule runs
 * in the browser for live feedback and on the API for enforcement.
 */

const COMMON = new Set([
  'password',
  '12345678',
  'password1',
  'qwerty123',
  'iloveyou',
  'admin123',
  'welcome1',
  'letmein1',
  '11111111',
  'india123',
  'changeme',
]);

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Very weak' | 'Weak' | 'Fair' | 'Strong' | 'Very strong';
  problems: string[];
}

const LABELS: PasswordStrength['label'][] = [
  'Very weak',
  'Weak',
  'Fair',
  'Strong',
  'Very strong',
];

export function passwordStrength(plain: string): PasswordStrength {
  const problems: string[] = [];
  let score = 0;

  if (plain.length >= PASSWORD_MIN_LENGTH) score++;
  else problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters`);

  if (plain.length >= 12) score++;

  if (/[a-z]/.test(plain) && /[A-Z]/.test(plain)) score++;
  else problems.push('Mix upper and lower case letters');

  if (/\d/.test(plain) || /[^\w\s]/.test(plain)) score++;
  else problems.push('Add a number or symbol');

  if (COMMON.has(plain.toLowerCase())) {
    score = 0;
    problems.push('This password is too common');
  }

  const clamped = Math.min(4, score) as PasswordStrength['score'];
  return { score: clamped, label: LABELS[clamped]!, problems };
}

export const MIN_ACCEPTABLE_SCORE = 2;
