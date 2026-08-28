import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ZodError } from 'zod';

import { runWithBindings, type CloudflareBindings } from '@pd/db';
import { ErrorCodes } from '@pd/shared';
import { AppError } from './lib/errors';
import { allowedOrigins } from './lib/env';
import authRoutes from './routes/auth';
import promptRoutes from './routes/prompts';

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
