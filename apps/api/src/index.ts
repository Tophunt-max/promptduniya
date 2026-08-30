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
import automationRoutes from './routes/automation';
import viewerRoutes from './routes/viewer';
import { clientIp } from './middleware';
import { enforce } from './lib/rate-limit';
import { hashIp, safeEqual } from './lib/crypto';
import { processWebhook } from './services/payments';
import { publishScheduled, recomputeTrending } from './services/prompts';
import { expireDueSubscriptions, remindExpiringSubscriptions } from './services/subscriptions';
import { getAutomationConfig } from './services/automation/config';
import { purgeAutomationLogs } from './services/automation/logs';
import { releaseStalled } from './services/automation/queue';
import { automationTick } from './services/automation/runner';

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
// Mounted before /v1/admin so the more specific prefix wins.
app.route('/v1/admin/automation', automationRoutes);
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

/**
 * Scheduled work.
 *
 * Two jobs on two cadences, both defined in `wrangler.jsonc`:
 *
 *   hourly   `runHourly` — publish anything whose scheduled time has passed, then
 *            give the content automation a tick.
 *   nightly  `runMaintenance` — the heavier, once-a-day work: trending scores,
 *            subscription expiries, and housekeeping on the automation tables.
 *
 * Publishing moved to the hourly job for a concrete reason. `prompts.scheduledFor`
 * is stored to the second, but while `publishScheduled` only ran at 19:30 UTC the
 * effective granularity was a day: a prompt scheduled for 09:00 went live sixteen
 * hours late. Since the automation needs an hourly tick anyway, publishing rides
 * along and the schedule now means roughly what it says.
 */
async function runHourly() {
  // Publishing first, deliberately. It is cheap, it has no external
  // dependencies, and it must not be starved by a slow or failing AI provider in
  // the automation step that follows.
  const published = await publishScheduled();
  const automation = await automationTick();

  return {
    published,
    automation: {
      ran: automation.ran,
      runId: automation.runId,
      succeeded: automation.succeeded,
      failed: automation.failed,
      skipped: automation.skipped,
      stopReason: automation.stopReason,
    },
  };
}

/**
 * Nightly maintenance: publish scheduled prompts, recompute trending scores,
 * expire lapsed subscriptions, warn members whose plan ends soon, and keep the
 * automation tables from growing without bound.
 *
 * Exposed both as a Cloudflare cron trigger (see `wrangler.jsonc`) and as an
 * authenticated POST so it can be run on demand. The POST requires
 * `CRON_SECRET` because it mutates platform-wide state.
 */
async function runMaintenance() {
  const [published, trending, expired, reminded, released] = await Promise.all([
    publishScheduled(),
    recomputeTrending(),
    expireDueSubscriptions(),
    remindExpiringSubscriptions(),
    // Frees queue rows abandoned by a Worker invocation that was killed
    // mid-item. Nothing else would ever release them.
    releaseStalled(),
  ]);

  // Reads its own retention setting rather than taking a constant, so an operator
  // can shorten it from the console when the log gets noisy.
  const config = await getAutomationConfig();
  const purgedLogs = await purgeAutomationLogs(config.logRetentionDays);

  return { published, trending, expired, reminded, released, purgedLogs };
}

app.post('/v1/cron/maintenance', async (c) => {
  const expected = (c.env as unknown as Record<string, string | undefined>).CRON_SECRET ?? '';
  const provided = c.req.header('x-cron-secret') ?? '';
  if (!expected || !safeEqual(expected, provided)) {
    throw AppError.forbidden('Invalid cron secret');
  }
  return c.json({ ok: true, data: await runMaintenance() });
});

/**
 * The hourly job, also exposed for an external scheduler.
 *
 * Useful when the platform's cron is unavailable, and the only way to exercise
 * the automation tick end to end without waiting for the top of an hour.
 */
app.post('/v1/cron/hourly', async (c) => {
  const expected = (c.env as unknown as Record<string, string | undefined>).CRON_SECRET ?? '';
  const provided = c.req.header('x-cron-secret') ?? '';
  if (!expected || !safeEqual(expected, provided)) {
    throw AppError.forbidden('Invalid cron secret');
  }
  return c.json({ ok: true, data: await runHourly() });
});

/** Copies the string-valued bindings out of env for the request context. */
function stringEnvOf(env: CloudflareBindings): Record<string, string | undefined> {
  const raw = env as unknown as Record<string, unknown>;
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

export default {
  fetch: app.fetch,
  /**
   * Cloudflare cron entry point.
   *
   * Which job runs is decided by `event.cron` matching the expression that fired,
   * so both schedules share this one handler. The nightly expression is matched
   * explicitly and everything else falls through to the hourly job: a cron entry
   * added to wrangler.jsonc without a matching branch here should still do
   * something sensible rather than silently nothing.
   */
  async scheduled(
    event: { cron?: string },
    env: CloudflareBindings,
    ctx: { waitUntil(p: Promise<unknown>): void },
  ) {
    const cron = event?.cron ?? '';

    ctx.waitUntil(
      runWithBindings(env, stringEnvOf(env), async () => {
        try {
          if (cron === NIGHTLY_CRON) {
            const result = await runMaintenance();
            console.info('[cron] nightly maintenance complete:', result);
          } else {
            const result = await runHourly();
            console.info(`[cron] hourly tick complete (${cron || 'unknown schedule'}):`, result);
          }
        } catch (error) {
          // A thrown error here is invisible except in logs, and losing the next
          // tick because this one failed would compound the problem.
          console.error('[cron] scheduled run failed:', error);
        }
      }),
    );
  },
};

/** Must match the nightly entry in `wrangler.jsonc`. */
const NIGHTLY_CRON = '30 19 * * *';
