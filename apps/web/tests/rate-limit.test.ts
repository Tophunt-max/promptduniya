import { beforeEach, describe, expect, it } from 'vitest';

import type { AppError } from '@/lib/api';
import {
  RATE_LIMITS,
  consume,
  enforce,
  rateLimitHeaders,
  setRateLimitStore,
  type RateLimitStore,
} from '@/lib/rate-limit';
import { nowSec } from '@/lib/dates';

/** An isolated in-memory store so each test starts from empty buckets. */
class TestStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  async hit(key: string, windowSec: number) {
    const now = nowSec();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowSec };
      this.buckets.set(key, fresh);
      return fresh;
    }
    existing.count += 1;
    return existing;
  }

  async reset(key: string) {
    this.buckets.delete(key);
  }

  /** Forces a bucket to look expired, to test window rollover. */
  expire(key: string) {
    const bucket = this.buckets.get(key);
    if (bucket) bucket.resetAt = nowSec() - 1;
  }
}

let store: TestStore;

beforeEach(() => {
  store = new TestStore();
  setRateLimitStore(store);
});

describe('rate limiting', () => {
  it('allows requests up to the limit and blocks the next one', async () => {
    const rule = { name: 'test:basic', limit: 3, windowSec: 60 };

    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await consume(rule, { identifier: 'user-1' });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3 - attempt);
    }

    const blocked = await consume(rule, { identifier: 'user-1' });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('keeps buckets separate per identifier', async () => {
    const rule = { name: 'test:isolation', limit: 1, windowSec: 60 };

    const first = await consume(rule, { identifier: 'user-a' });
    const second = await consume(rule, { identifier: 'user-b' });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
  });

  it('keeps buckets separate per rule', async () => {
    const identifier = 'shared-user';

    const login = await consume({ name: 'test:login', limit: 1, windowSec: 60 }, { identifier });
    const search = await consume({ name: 'test:search', limit: 1, windowSec: 60 }, { identifier });

    expect(login.allowed).toBe(true);
    expect(search.allowed).toBe(true);
  });

  it('scales the limit by the multiplier', async () => {
    const rule = { name: 'test:premium', limit: 2, windowSec: 60 };

    // A premium multiplier of 4 gives an effective limit of 8.
    for (let attempt = 1; attempt <= 8; attempt++) {
      const result = await consume(rule, { identifier: 'premium-user', multiplier: 4 });
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(8);
    }

    const blocked = await consume(rule, { identifier: 'premium-user', multiplier: 4 });
    expect(blocked.allowed).toBe(false);
  });

  it('resets once the window rolls over', async () => {
    const rule = { name: 'test:window', limit: 1, windowSec: 60 };

    await consume(rule, { identifier: 'roll-user' });
    expect((await consume(rule, { identifier: 'roll-user' })).allowed).toBe(false);

    store.expire('test:window:roll-user');

    const afterReset = await consume(rule, { identifier: 'roll-user' });
    expect(afterReset.allowed).toBe(true);
  });

  it('throws a 429 AppError from enforce when exhausted', async () => {
    const rule = { name: 'test:enforce', limit: 1, windowSec: 60 };

    await enforce(rule, { identifier: 'enforce-user' });

    try {
      await enforce(rule, { identifier: 'enforce-user' });
      expect.unreachable('the second call should have thrown');
    } catch (error) {
      const appError = error as AppError;
      expect(appError.status).toBe(429);
      expect(appError.code).toBe('rate_limited');
      expect(appError.message).toMatch(/too many requests/i);
    }
  });

  it('emits standard rate-limit headers', async () => {
    const rule = { name: 'test:headers', limit: 5, windowSec: 60 };
    const result = await consume(rule, { identifier: 'header-user' });
    const headers = rateLimitHeaders(result);

    expect(headers['X-RateLimit-Limit']).toBe('5');
    expect(headers['X-RateLimit-Remaining']).toBe('4');
    expect(headers['X-RateLimit-Reset']).toBeTruthy();
    expect(headers['Retry-After']).toBeUndefined();
  });

  it('adds Retry-After only when blocked', async () => {
    const rule = { name: 'test:retry', limit: 1, windowSec: 60 };
    await consume(rule, { identifier: 'retry-user' });
    const blocked = await consume(rule, { identifier: 'retry-user' });

    expect(rateLimitHeaders(blocked)['Retry-After']).toBeTruthy();
  });
});

describe('configured limits', () => {
  it('protects every sensitive endpoint class', () => {
    const required = [
      'login',
      'signup',
      'passwordReset',
      'search',
      'generator',
      'copy',
      'like',
      'favorite',
      'payment',
      'coupon',
      'contact',
      'adminWrite',
      'adminRead',
      'webhook',
    ] as const;

    for (const name of required) {
      expect(RATE_LIMITS[name]).toBeDefined();
      expect(RATE_LIMITS[name].limit).toBeGreaterThan(0);
      expect(RATE_LIMITS[name].windowSec).toBeGreaterThan(0);
    }
  });

  it('keeps authentication limits tight', () => {
    // Brute-forcing a login must be expensive.
    expect(RATE_LIMITS.login.limit).toBeLessThanOrEqual(10);
    expect(RATE_LIMITS.signup.limit).toBeLessThanOrEqual(10);
    expect(RATE_LIMITS.passwordReset.limit).toBeLessThanOrEqual(10);
    expect(RATE_LIMITS.contact.limit).toBeLessThanOrEqual(10);
  });

  it('keeps payment limits tight', () => {
    expect(RATE_LIMITS.payment.limit).toBeLessThanOrEqual(20);
  });
});
