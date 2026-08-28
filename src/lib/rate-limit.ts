import { AppError } from './api';
import { nowSec } from './dates';

/**
 * Fixed-window rate limiter.
 *
 * The default driver keeps counters in process memory, which is correct for a
 * single instance and for local development. `RATE_LIMIT_DRIVER=redis` with a
 * `REDIS_URL` is the documented path for multi-instance deployments — the
 * `RateLimitStore` interface below is the single seam to implement.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
  retryAfter: number;
}

export interface RateLimitStore {
  hit(key: string, windowSec: number): Promise<{ count: number; resetAt: number }>;
  reset(key: string): Promise<void>;
}

class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = 0;

  async hit(key: string, windowSec: number) {
    const now = nowSec();
    this.sweep(now);

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

  private sweep(now: number) {
    if (now - this.lastSweep < 60) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

const globalForLimiter = globalThis as unknown as { __pdRateStore?: RateLimitStore };
globalForLimiter.__pdRateStore ??= new MemoryStore();

export function rateLimitStore(): RateLimitStore {
  return globalForLimiter.__pdRateStore!;
}

/** Overrides the store — used by tests. */
export function setRateLimitStore(store: RateLimitStore) {
  globalForLimiter.__pdRateStore = store;
}

export interface RateLimitRule {
  /** Namespace, e.g. "auth:login". */
  name: string;
  limit: number;
  windowSec: number;
}

/**
 * Sensible defaults per endpoint class. Premium users get a multiplier applied
 * by `consume()` so paying customers are never throttled like anonymous users.
 */
export const RATE_LIMITS = {
  login: { name: 'auth:login', limit: 8, windowSec: 300 },
  signup: { name: 'auth:signup', limit: 5, windowSec: 3600 },
  passwordReset: { name: 'auth:password-reset', limit: 5, windowSec: 3600 },
  emailVerify: { name: 'auth:email-verify', limit: 10, windowSec: 3600 },
  search: { name: 'search', limit: 90, windowSec: 60 },
  generator: { name: 'generator', limit: 20, windowSec: 3600 },
  randomGenerator: { name: 'generator:random', limit: 60, windowSec: 3600 },
  copy: { name: 'prompt:copy', limit: 120, windowSec: 3600 },
  like: { name: 'prompt:like', limit: 90, windowSec: 3600 },
  favorite: { name: 'prompt:favorite', limit: 90, windowSec: 3600 },
  view: { name: 'prompt:view', limit: 300, windowSec: 3600 },
  payment: { name: 'payment', limit: 12, windowSec: 3600 },
  coupon: { name: 'coupon', limit: 20, windowSec: 3600 },
  contact: { name: 'contact', limit: 4, windowSec: 3600 },
  report: { name: 'report', limit: 10, windowSec: 3600 },
  adminWrite: { name: 'admin:write', limit: 240, windowSec: 60 },
  adminRead: { name: 'admin:read', limit: 600, windowSec: 60 },
  analytics: { name: 'analytics', limit: 240, windowSec: 60 },
  webhook: { name: 'webhook', limit: 600, windowSec: 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export interface ConsumeOptions {
  /** Stable identifier: user id when authenticated, otherwise a hashed IP. */
  identifier: string;
  /** Multiplies the base limit (e.g. 3 for premium members). */
  multiplier?: number;
}

export async function consume(
  rule: RateLimitName | RateLimitRule,
  { identifier, multiplier = 1 }: ConsumeOptions,
): Promise<RateLimitResult> {
  const resolved: RateLimitRule = typeof rule === 'string' ? RATE_LIMITS[rule] : rule;
  const limit = Math.max(1, Math.floor(resolved.limit * multiplier));
  const key = `${resolved.name}:${identifier}`;

  const { count, resetAt } = await rateLimitStore().hit(key, resolved.windowSec);
  const remaining = Math.max(0, limit - count);

  return {
    allowed: count <= limit,
    remaining,
    limit,
    resetAt,
    retryAfter: Math.max(1, resetAt - nowSec()),
  };
}

/** Consumes a token and throws a 429 AppError when the bucket is exhausted. */
export async function enforce(
  rule: RateLimitName | RateLimitRule,
  options: ConsumeOptions,
): Promise<RateLimitResult> {
  const result = await consume(rule, options);
  if (!result.allowed) {
    throw AppError.rateLimited(
      `Too many requests. Please try again in ${result.retryAfter} second${
        result.retryAfter === 1 ? '' : 's'
      }.`,
      { retryAfter: result.retryAfter, limit: result.limit },
    );
  }
  return result;
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.resetAt),
    ...(result.allowed ? {} : { 'Retry-After': String(result.retryAfter) }),
  };
}
