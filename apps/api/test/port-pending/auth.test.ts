import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { passwordStrength } from '@/lib/auth/password-strength';
import { AppError } from '@/lib/api';
import { changePassword, createUser, findUserByEmail } from '@/services/auth';
import { resetDatabase, seedRoles } from './helpers';

describe('password handling', () => {
  it('never stores the plaintext password', async () => {
    const plain = 'CorrectHorse7!';
    const hash = await hashPassword(plain);

    expect(hash).not.toContain(plain);
    expect(hash.startsWith('$2')).toBe(true);
    expect(hash.length).toBeGreaterThan(50);
  });

  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('CorrectHorse7!');

    await expect(verifyPassword('CorrectHorse7!', hash)).resolves.toBe(true);
    await expect(verifyPassword('WrongHorse7!', hash)).resolves.toBe(false);
    await expect(verifyPassword('CorrectHorse7!', null)).resolves.toBe(false);
  });

  it('produces a different hash for the same password (salted)', async () => {
    const a = await hashPassword('CorrectHorse7!');
    const b = await hashPassword('CorrectHorse7!');
    expect(a).not.toBe(b);
  });

  it('rejects passwords that are too short', async () => {
    await expect(hashPassword('short')).rejects.toThrow(/at least 8/i);
  });

  it('scores common passwords as unusable', () => {
    expect(passwordStrength('password').score).toBe(0);
    expect(passwordStrength('india123').score).toBe(0);
    expect(passwordStrength('CorrectHorse7!').score).toBeGreaterThanOrEqual(3);
  });
});

describe('account creation', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedRoles();
  });

  it('creates a user with a hashed password and a unique username', async () => {
    const user = await createUser({
      name: 'Ananya Sharma',
      email: 'Ananya@Example.COM',
      password: 'CorrectHorse7!',
    });

    expect(user.passwordHash).toBeTruthy();
    expect(user.passwordHash).not.toContain('CorrectHorse7!');
    // Email is normalised for lookup but the display form is preserved.
    expect(user.emailNormalized).toBe('ananya@example.com');
    expect(user.username).toMatch(/^[a-z0-9_]+$/);
  });

  it('rejects a duplicate email regardless of case', async () => {
    await createUser({ name: 'First', email: 'dupe@example.com', password: 'CorrectHorse7!' });

    await expect(
      createUser({ name: 'Second', email: 'DUPE@example.com', password: 'CorrectHorse7!' }),
    ).rejects.toThrow(AppError);
  });

  it('gives colliding names distinct usernames', async () => {
    const first = await createUser({
      name: 'Ravi Kumar',
      email: 'ravi1@example.com',
      password: 'CorrectHorse7!',
    });
    const second = await createUser({
      name: 'Ravi Kumar',
      email: 'ravi2@example.com',
      password: 'CorrectHorse7!',
    });

    expect(first.username).not.toBe(second.username);
  });

  it('refuses a weak password', async () => {
    await expect(
      createUser({ name: 'Weak', email: 'weak@example.com', password: 'password' }),
    ).rejects.toThrow(AppError);
  });
});

describe('password change', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRoles();
  });

  it('requires the current password to be correct', async () => {
    const user = await createUser({
      name: 'Member',
      email: 'change@example.com',
      password: 'CorrectHorse7!',
    });

    await expect(changePassword(user.id, 'WrongPassword1!', 'NewStrongPass9!')).rejects.toThrow(
      /current password is incorrect/i,
    );
  });

  it('changes the password and invalidates the old one', async () => {
    const user = await createUser({
      name: 'Member',
      email: 'change2@example.com',
      password: 'CorrectHorse7!',
    });

    await changePassword(user.id, 'CorrectHorse7!', 'NewStrongPass9!');

    const updated = await findUserByEmail('change2@example.com');
    await expect(verifyPassword('NewStrongPass9!', updated!.passwordHash)).resolves.toBe(true);
    await expect(verifyPassword('CorrectHorse7!', updated!.passwordHash)).resolves.toBe(false);
  });

  it('rejects a weak new password', async () => {
    const user = await createUser({
      name: 'Member',
      email: 'change3@example.com',
      password: 'CorrectHorse7!',
    });

    await expect(changePassword(user.id, 'CorrectHorse7!', 'password')).rejects.toThrow(AppError);
  });
});
