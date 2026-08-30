import { useEnv } from '@pd/db';

/**
 * Typed access to Worker environment (vars + secrets).
 *
 * On Cloudflare there is no `process.env`; configuration arrives on the Worker
 * `env` binding and is captured into the request context. This reads from there.
 */
export interface ApiConfig {
  environment: string;
  webOrigin: string;
  adminOrigin: string;
  authSecret: string;
  accessTokenMinutes: number;
  refreshTokenDays: number;
  bcryptRounds: number;
  paymentsMockMode: boolean;
  paymentsCurrency: string;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  razorpayWebhookSecret: string;
  aiProvider: string;
  aiApiKey: string;
  /** Cover image generation: 'workers-ai' | 'gemini' | 'none'. */
  imageProvider: string;
  emailProvider: string;
  r2PublicUrl: string;
}

function str(env: Record<string, string | undefined>, key: string, fallback = ''): string {
  const value = env[key];
  return value === undefined || value === '' ? fallback : value;
}

function bool(env: Record<string, string | undefined>, key: string, fallback: boolean): boolean {
  const value = env[key];
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

function num(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const value = Number(env[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function config(): ApiConfig {
  const env = useEnv();
  const authSecret = str(env, 'AUTH_SECRET');
  if (authSecret.length < 16) {
    throw new Error('AUTH_SECRET is missing or too short (set it with `wrangler secret put AUTH_SECRET`)');
  }

  return {
    environment: str(env, 'ENVIRONMENT', 'production'),
    webOrigin: str(env, 'WEB_ORIGIN', 'http://localhost:3000'),
    adminOrigin: str(env, 'ADMIN_ORIGIN', 'http://localhost:5173'),
    authSecret,
    accessTokenMinutes: num(env, 'ACCESS_TOKEN_MINUTES', 15),
    refreshTokenDays: num(env, 'REFRESH_TOKEN_DAYS', 30),
    bcryptRounds: num(env, 'AUTH_BCRYPT_ROUNDS', 10),
    paymentsMockMode: bool(env, 'PAYMENTS_MOCK_MODE', true),
    paymentsCurrency: str(env, 'PAYMENTS_CURRENCY', 'INR'),
    razorpayKeyId: str(env, 'RAZORPAY_KEY_ID'),
    razorpayKeySecret: str(env, 'RAZORPAY_KEY_SECRET'),
    razorpayWebhookSecret: str(env, 'RAZORPAY_WEBHOOK_SECRET'),
    aiProvider: str(env, 'AI_PROVIDER', 'template'),
    aiApiKey: str(env, 'AI_API_KEY'),
    imageProvider: str(env, 'IMAGE_PROVIDER', 'workers-ai'),
    emailProvider: str(env, 'EMAIL_PROVIDER', 'console'),
    r2PublicUrl: str(env, 'R2_PUBLIC_URL'),
  };
}

export function allowedOrigins(): string[] {
  const c = config();
  return [c.webOrigin, c.adminOrigin].filter(Boolean);
}

export function razorpayConfigured(): boolean {
  const c = config();
  return Boolean(c.razorpayKeyId && c.razorpayKeySecret) && !c.paymentsMockMode;
}
