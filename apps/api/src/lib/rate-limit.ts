import { useKv } from '@pd/db';

import { AppError } from './errors';
import { nowSec } from './dates';

/**
 * Fixed-window rate limiter backed by Cloudflare KV.
 *
 * Unlike the monolith's in-memory limiter, KV is shared across every Worker
 * isolate, so limits hold globally. KV is eventually consistent, so counts can
 * lag by a second or two under burst — acceptable for abuse protection, and far
 * better than per-isolate memory. For hard guarantees, a Durable Object is the
 * upgrade path.
 */

export interface RateLimitRule {
  name: string;
  limit: number;
  windowSec: number;
}

export const RATE_LIMITS = {
  login: { name: 'auth:login', limit: 8, windowSec: 300 },
  signup: { name: 'auth:signup', limit: 5, windowSec: 3600 },
  passwordReset: { name: 'auth:pw-reset', limit: 5, windowSec: 3600 },
  emailVerify: { name: 'auth:email-verify', limit: 10, windowSec: 3600 },
  refresh: { name: 'auth:refresh', limit: 60, windowSec: 3600 },
  search: { name: 'search', limit: 90, windowSec: 60 },
  generator: { name: 'generator', limit: 20, windowSec: 3600 },
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
  webhook: { name: 'webhook', limit: 600, windowSec: 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
  retryAfter: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export async function consume(
  rule: RateLimitName | RateLimitRule,
  identifier: string,
  multiplier = 1,
): Promise<RateLimitResult> {
  const resolved: RateLimitRule = typeof rule === 'string' ? RATE_LIMITS[rule] : rule;
  const limit = Math.max(1, Math.floor(resolved.limit * multiplier));
  const key = `rl:${resolved.name}:${identifier}`;
  const kv = useKv().rateLimit;
  const now = nowSec();

  const existing = (await kv.get<Bucket>(key, 'json')) ?? null;
  let bucket: Bucket;
  if (!existing || existing.resetAt <= now) {
    bucket = { count: 1, resetAt: now + resolved.windowSec };
  } else {
    bucket = { count: existing.count + 1, resetAt: existing.resetAt };
  }

  // TTL a little beyond the window so stale buckets self-expire.
  await kv.put(key, JSON.stringify(bucket), {
    expirationTtl: Math.max(60, bucket.resetAt - now + 5),
  });

  const remaining = Math.max(0, limit - bucket.count);
  return {
    allowed: bucket.count <= limit,
    remaining,
    limit,
    resetAt: bucket.resetAt,
    retryAfter: Math.max(1, bucket.resetAt - now),
  };
}

export async function enforce(
  rule: RateLimitName | RateLimitRule,
  identifier: string,
  multiplier = 1,
): Promise<RateLimitResult> {
  const result = await consume(rule, identifier, multiplier);
  if (!result.allowed) {
    throw AppError.rateLimited(
      `Too many requests. Try again in ${result.retryAfter}s.`,
      { retryAfter: result.retryAfter, limit: result.limit },
    );
  }
  return result;
}
