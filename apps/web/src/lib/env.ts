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

  DATABASE_URL: z.string().min(1).default('file:./data/promptduniya.db'),
  DATABASE_AUTH_TOKEN: z.string().optional(),

  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 characters'),
  AUTH_SESSION_DAYS: z.coerce.number().int().positive().max(365).default(30),
  AUTH_BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  PRIMARY_DOMAIN: z.string().default('promptduniya.in'),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  PAYMENTS_MOCK_MODE: boolish(true),
  PAYMENTS_CURRENCY: z.string().length(3).default('INR'),

  AI_PROVIDER: z.enum(['template', 'gemini', 'openai']).default('template'),
  AI_API_KEY: z.string().optional(),
  AI_API_BASE_URL: z.string().optional(),
  AI_MODEL: z.string().optional(),

  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),

  EMAIL_PROVIDER: z.enum(['console', 'smtp', 'resend']).default('console'),
  EMAIL_FROM: z.string().default('promptduniya <no-reply@promptduniya.in>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),

  RATE_LIMIT_DRIVER: z.enum(['memory', 'redis']).default('memory'),
  REDIS_URL: z.string().optional(),

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

/** Whether real Razorpay credentials are configured. */
export function razorpayConfigured(): boolean {
  const e = env();
  return Boolean(e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET) && !e.PAYMENTS_MOCK_MODE;
}

/** Whether a real AI provider is configured for the generator. */
export function aiConfigured(): boolean {
  const e = env();
  return e.AI_PROVIDER !== 'template' && Boolean(e.AI_API_KEY);
}

/** Whether object storage is configured, otherwise local disk is used. */
export function storageConfigured(): boolean {
  const e = env();
  return Boolean(e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET);
}
