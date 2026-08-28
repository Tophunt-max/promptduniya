import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Per-test-file environment bootstrap.
 *
 * These variables must be set before any application module is imported,
 * because `env()` caches its parsed result on first read. The database file is
 * created (and removed) by `global-setup.ts`, not here.
 */

const TEST_DB_DIR = resolve(process.cwd(), '.vitest');
mkdirSync(TEST_DB_DIR, { recursive: true });

// `NODE_ENV` is typed as read-only by @types/node, so it is set through an
// index assignment rather than a direct property write.
(process.env as Record<string, string>).NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${resolve(TEST_DB_DIR, 'test.db')}`;
process.env.AUTH_SECRET = 'test-secret-value-that-is-long-enough-0123456789';
// Keep bcrypt cheap: the suite hashes a lot of passwords.
process.env.AUTH_BCRYPT_ROUNDS = '4';
process.env.AUTH_SESSION_DAYS = '7';
process.env.PAYMENTS_MOCK_MODE = 'true';
process.env.PAYMENTS_CURRENCY = 'INR';
process.env.RAZORPAY_KEY_SECRET = 'test_mock_secret_key';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_mock_webhook_secret';
process.env.AI_PROVIDER = 'template';
process.env.EMAIL_PROVIDER = 'console';
process.env.RATE_LIMIT_DRIVER = 'memory';
process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
process.env.NEXT_PUBLIC_SITE_NAME = 'promptduniya';
