import { z } from 'zod';

/**
 * Server-side environment validation.
 *
 * This module must never be imported from a client component — it reads
 * secrets. Public values live in `publicEnv` below and are inlined at build
 * time by Next.js because they are read as literal `process.env.NEXT_PUBLIC_*`.
 */

const boolish = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : v === 'true' || v === '1'));

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /**
   * Base URL of the promptduniya API worker. Used by the HTTP transport; when
   * a Cloudflare service binding is present the host is ignored but the value
   * must still be a valid absolute URL.
   */
  API_BASE_URL: z.string().url().default('http://127.0.0.1:8787'),

  /**
   * Shared with the API — used to verify the access-token signature locally so
   * resolving a session costs no network call.
   */
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 characters'),
  /** Lifetime of the refresh cookie; must match the API's REFRESH_TOKEN_DAYS. */
  AUTH_SESSION_DAYS: z.coerce.number().int().positive().max(365).default(30),

  PRIMARY_DOMAIN: z.string().default('promptduniya.in'),

  /** Shared with the API so the maintenance job can be kicked manually. */
  CRON_SECRET: z.string().optional(),

  MAINTENANCE_MODE: boolish(false),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

function buildEnv(): ServerEnv {
  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');

    // During `next build` there is no .env in CI; fall back to safe defaults so
    // the build can complete, but never in a real runtime.
    if (process.env.NODE_ENV !== 'production' || process.env.NEXT_PHASE) {
      return serverSchema.parse({
        ...process.env,
        AUTH_SECRET: process.env.AUTH_SECRET ?? 'build-time-placeholder-secret-value',
      });
    }

    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}

export function env(): ServerEnv {
  cached ??= buildEnv();
  return cached;
}

/** Public, browser-safe configuration. */
export const publicEnv = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  siteName: process.env.NEXT_PUBLIC_SITE_NAME || 'promptduniya',
  tagline: process.env.NEXT_PUBLIC_SITE_TAGLINE || 'Create Better. Imagine More.',
  razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
  analyticsEnabled: process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== 'false',
  adsEnabled: process.env.NEXT_PUBLIC_ADS_ENABLED === 'true',
} as const;

export const isProd = () => env().NODE_ENV === 'production';
export const isTest = () => env().NODE_ENV === 'test';
