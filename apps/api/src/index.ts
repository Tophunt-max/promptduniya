import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ZodError } from 'zod';

import { runWithBindings, type CloudflareBindings } from '@pd/db';
import { ErrorCodes } from '@pd/shared';
import { AppError } from './lib/errors';
import { allowedOrigins } from './lib/env';
import authRoutes from './routes/auth';
import promptRoutes from './routes/prompts';
import generatorRoutes from './routes/generator';
import catalogRoutes from './routes/catalog';
import paymentRoutes from './routes/payments';
import adminRoutes from './routes/admin';
import viewerRoutes from './routes/viewer';
import { clientIp } from './middleware';
import { enforce } from './lib/rate-limit';
import { hashIp } from './lib/crypto';
import { processWebhook } from './services/payments';

/**
 * promptduniya API — a Hono Worker on Cloudflare.
 *
 * Every request runs inside `runWithBindings`, which binds D1/KV/R2 into an
 * AsyncLocalStorage context so the service layer can stay binding-agnostic
 * (services just import `db`, `useKv()`, `useR2()` from `@pd/db`).
 */
const app = new Hono<{ Bindings: CloudflareBindings }>();

// 1. Bind D1/KV/R2 into request context for the whole request lifecycle.
app.use('*', async (c, next) => {
  const raw = c.env as Record<string, unknown>;
  const stringEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') stringEnv[key] = value;
  }
  return runWithBindings(c.env, stringEnv, () => next());
});

// 2. CORS — only the configured web and admin origins, with credentials.
app.use('*', (c, next) =>
  cors({
    origin: (origin) => {
      try {
        return allowedOrigins().includes(origin) ? origin : allowedOrigins()[0] ?? '';
      } catch {
        return origin;
      }
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86_400,
  })(c, next),
);

app.get('/', (c) => c.json({ ok: true, data: { service: 'promptduniya-api', status: 'ready' } }));
app.get('/health', (c) => c.json({ ok: true, data: { status: 'healthy', ts: Date.now() } }));

// 3. Versioned routes.
app.route('/v1/auth', authRoutes);
app.route('/v1/prompts', promptRoutes);
app.route('/v1/generator', generatorRoutes);
app.route('/v1/catalog', catalogRoutes);
app.route('/v1/payments', paymentRoutes);
app.route('/v1/admin', adminRoutes);
app.route('/v1/viewer', viewerRoutes);

// Provider webhook — no session/CORS auth; authenticity is the HMAC signature.
// Mounted on its own path (not under the /v1/payments sub-app) so the raw body
// is read verbatim without the auth middleware running.
app.post('/v1/webhooks/razorpay', async (c) => {
  await enforce('webhook', hashIp(clientIp(c as never)));
  const rawBody = await c.req.text();
  const signature = c.req.header('x-razorpay-signature') ?? c.req.header('x-webhook-signature') ?? null;
  const deliveryId = c.req.header('x-razorpay-event-id') ?? c.req.header('x-webhook-event-id') ?? null;
  const outcome = await processWebhook({ rawBody, signature, deliveryId });
  return c.json({ ok: true, data: outcome });
});

// 4. Consistent error envelope. Internal details are never leaked.
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json(
      { ok: false, error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } },
      err.status as never,
    );
  }
  if (err instanceof ZodError) {
    return c.json(
      {
        ok: false,
        error: {
          code: ErrorCodes.VALIDATION,
          message: 'Please check the highlighted fields',
          details: { issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
        },
      },
      422,
    );
  }
  console.error('[api] unhandled error:', err);
  return c.json(
    { ok: false, error: { code: ErrorCodes.INTERNAL, message: 'Something went wrong on our side' } },
    500,
  );
});

app.notFound((c) =>
  c.json({ ok: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Route not found' } }, 404),
);

export default app;
