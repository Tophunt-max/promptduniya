import { Hono, type Context } from 'hono';

import {
  automationConfigSchema,
  automationLogQuerySchema,
  automationProcessSchema,
  ideaGenerateSchema,
  queueApproveSchema,
  queueEnqueueSchema,
  queueQuerySchema,
  trendDiscoverSchema,
  trendManualSchema,
  trendQuerySchema,
} from '@pd/shared';

import { clientIp, limit, requireAdmin, requireEditor, withAccess, type Vars } from '../middleware';
import { AppError } from '../lib/errors';
import { nowSec } from '../lib/dates';
import { logAdminAction } from '../services/admin';
import { getAutomationConfig, setAutomationConfig } from '../services/automation/config';
import { generateIdeas } from '../services/automation/ideas';
import {
  automationLogSummary,
  listAutomationLogs,
} from '../services/automation/logs';
import {
  cancel,
  enqueue,
  getQueueItem,
  listQueue,
  listRuns,
  pendingCount,
  queueCounts,
  retry,
  settle,
} from '../services/automation/queue';
import {
  isScheduledSlot,
  nextSlotAt,
  runAutomationCycle,
} from '../services/automation/runner';
import {
  addManualSignal,
  discoverTrends,
  listTrendSignals,
  markSignals,
  trendCounts,
} from '../services/automation/trends';
import { setPromptPublished } from '../services/prompts';
import { studioStatus } from '../services/studio/pipeline';
import { db, prompts } from '@pd/db';
import { eq } from 'drizzle-orm';

/**
 * AI content automation API.
 *
 * Mounted at /v1/admin/automation. A separate sub-app rather than another
 * section of routes/admin.ts, which is already past 700 lines and covers a dozen
 * unrelated resources — this is one coherent feature with a dozen endpoints of
 * its own.
 *
 * Authorisation follows the existing split: editors run and inspect the
 * pipeline, because that is content work, while only a full administrator can
 * change the configuration, because those settings decide how much of the
 * account's AI budget gets spent and whether machine-written posts reach the
 * public site unattended.
 *
 * Every endpoint that spends a provider quota carries the `aiGenerate` or
 * `aiDiscover` rate limit. Before this, `POST /studio/run` was authenticated but
 * completely unthrottled, which meant a stuck retry loop in a browser could
 * exhaust a day's allocation.
 */
const automation = new Hono<{ Bindings: Record<string, unknown>; Variables: Vars }>();
automation.use('*', withAccess);

type Ctx = Context<{ Bindings: Record<string, unknown>; Variables: Vars }>;

function query(c: Ctx): Record<string, string> {
  return Object.fromEntries(new URL(c.req.url).searchParams);
}

/* ================================ Overview =============================== */

/**
 * Everything the automation dashboard needs in one request.
 *
 * Deliberately one call rather than six. The screen cannot render anything
 * useful without all of it — the config decides which controls are live, the
 * counts decide which tabs to show, provider status decides whether to warn — so
 * six parallel requests would only mean six chances to render half a page.
 */
automation.get('/overview', async (c) => {
  requireEditor(c);

  const config = await getAutomationConfig();

  const [queue, trends, pending, runs, logs] = await Promise.all([
    queueCounts(),
    trendCounts(),
    pendingCount(),
    listRuns({ pageSize: 5 }),
    automationLogSummary(7),
  ]);

  const at = nowSec();

  return c.json({
    ok: true,
    data: {
      config,
      providers: studioStatus(),
      queue,
      trends,
      pending,
      recentRuns: runs.items,
      logSummary: logs,
      schedule: {
        inSlotNow: isScheduledSlot(config, at),
        nextSlotAt: nextSlotAt(config, at),
        serverTime: at,
      },
    },
  });
});

/* ============================= Configuration ============================= */

automation.get('/config', async (c) => {
  requireEditor(c);
  return c.json({ ok: true, data: await getAutomationConfig() });
});

automation.put('/config', async (c) => {
  const claims = requireAdmin(c);
  await limit(c, 'adminWrite');

  const body = automationConfigSchema.parse(await c.req.json());
  const config = await setAutomationConfig(body, claims.sub);

  await logAdminAction({
    actorId: claims.sub,
    action: 'automation.config.update',
    targetType: 'setting',
    targetId: 'automation',
    meta: { keys: Object.keys(body) },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: config });
});

/* ================================= Queue ================================= */

automation.get('/queue', async (c) => {
  requireEditor(c);
  const params = queueQuerySchema.parse(query(c));
  return c.json({ ok: true, data: await listQueue(params) });
});

automation.get('/queue/counts', async (c) => {
  requireEditor(c);
  return c.json({ ok: true, data: await queueCounts() });
});

/**
 * Adds briefs to the queue.
 *
 * Returns immediately after the insert. Generation happens later in a run, which
 * is the whole point of having a queue: an operator asking for fifty posts should
 * get an answer in milliseconds, not sit on a connection for half an hour.
 */
automation.post('/queue', async (c) => {
  const claims = requireEditor(c);
  await limit(c, 'adminWrite');

  const body = queueEnqueueSchema.parse(await c.req.json());

  const items = await enqueue({
    themes: body.themes,
    categoryId: body.categoryId,
    aiModel: body.aiModel,
    inputMode: body.inputMode,
    isPremium: body.isPremium,
    publishMode: body.publishMode,
    scheduledFor: body.scheduledFor ?? null,
    skipCover: body.skipCover,
    priority: body.priority,
    source: 'manual',
    trendSignalId: body.trendSignalId ?? null,
    createdBy: claims.sub,
  });

  // Mark the originating signal used so discovery does not re-suggest it.
  if (body.trendSignalId) await markSignals([body.trendSignalId], 'used');

  await logAdminAction({
    actorId: claims.sub,
    action: 'automation.queue.enqueue',
    targetType: 'content_queue',
    meta: { count: items.length, publishMode: body.publishMode },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: { items, queued: items.length } }, 201);
});

automation.post('/queue/:id/retry', async (c) => {
  const claims = requireEditor(c);
  await limit(c, 'adminWrite');

  const id = c.req.param('id');
  await retry(id);

  await logAdminAction({
    actorId: claims.sub,
    action: 'automation.queue.retry',
    targetType: 'content_queue',
    targetId: id,
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: { id, status: 'queued' } });
});

automation.post('/queue/:id/cancel', async (c) => {
  const claims = requireEditor(c);
  await limit(c, 'adminWrite');

  const id = c.req.param('id');
  await cancel(id);

  await logAdminAction({
    actorId: claims.sub,
    action: 'automation.queue.cancel',
    targetType: 'content_queue',
    targetId: id,
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: { id, status: 'cancelled' } });
});

/**
 * Approves an item the quality gate held back.
 *
 * The prompt already exists as a draft — the gate only stopped it publishing —
 * so this publishes or schedules that existing row rather than regenerating
 * anything. An operator overriding the score is a legitimate and expected act;
 * the score is advice, not a verdict.
 */
automation.post('/queue/:id/approve', async (c) => {
  const claims = requireEditor(c);
  await limit(c, 'adminWrite');

  const id = c.req.param('id');
  const body = queueApproveSchema.parse(await c.req.json().catch(() => ({})));

  const item = await getQueueItem(id);
  if (!item) throw AppError.notFound('Queue item not found');
  if (!item.promptId) {
    throw AppError.badRequest(
      'This item never produced a prompt, so there is nothing to approve. Retry it instead.',
    );
  }

  let status: 'published' | 'scheduled' | 'approved' = 'approved';
  let scheduledFor: number | null = null;

  if (body.publishMode === 'publish') {
    await setPromptPublished(item.promptId, true);
    status = 'published';
  } else if (body.publishMode === 'schedule') {
    scheduledFor = body.scheduledFor ?? nowSec() + 86_400;
    await db
      .update(prompts)
      .set({ scheduledFor, updatedAt: nowSec() })
      .where(eq(prompts.id, item.promptId));
    status = 'scheduled';
  }

  await settle(id, status, { scheduledFor });

  await logAdminAction({
    actorId: claims.sub,
    action: 'automation.queue.approve',
    targetType: 'prompt',
    targetId: item.promptId,
    meta: { queueItemId: id, publishMode: body.publishMode, qualityScore: item.qualityScore },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: { id, status, scheduledFor, promptId: item.promptId } });
});

/* ================================== Runs ================================= */

/**
 * Drains the queue now.
 *
 * `force: true` bypasses the enabled flag and the hour check — an operator
 * pressing this button has made the decision that those settings encode, and
 * making them re-enable automation just to test it would be needless friction.
 * The daily cap is still bypassed only because the operator asked explicitly.
 */
automation.post('/process', async (c) => {
  const claims = requireEditor(c);
  await limit(c, 'aiGenerate');

  const body = automationProcessSchema.parse(await c.req.json().catch(() => ({})));

  const result = await runAutomationCycle({
    trigger: 'manual',
    limit: body.limit,
    budgetSeconds: body.budgetSeconds,
    topUp: body.topUp,
    force: true,
    triggeredBy: claims.sub,
  });

  await logAdminAction({
    actorId: claims.sub,
    action: 'automation.process',
    targetType: 'automation_run',
    targetId: result.runId ?? undefined,
    meta: {
      succeeded: result.succeeded,
      failed: result.failed,
      skipped: result.skipped,
      stopReason: result.stopReason,
    },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: result });
});

automation.get('/runs', async (c) => {
  requireEditor(c);
  const params = queueQuerySchema.pick({ page: true, pageSize: true }).parse(query(c));
  return c.json({ ok: true, data: await listRuns(params) });
});

/* ================================= Trends ================================ */

automation.get('/trends', async (c) => {
  requireEditor(c);
  const params = trendQuerySchema.parse(query(c));
  return c.json({ ok: true, data: await listTrendSignals(params) });
});

automation.post('/trends/discover', async (c) => {
  const claims = requireEditor(c);
  await limit(c, 'aiDiscover');

  const body = trendDiscoverSchema.parse(await c.req.json().catch(() => ({})));
  const result = await discoverTrends({
    aiCount: body.aiCount,
    internalOnly: body.internalOnly,
  });

  await logAdminAction({
    actorId: claims.sub,
    action: 'automation.trends.discover',
    meta: { ...result },
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: result });
});

automation.post('/trends', async (c) => {
  const claims = requireEditor(c);
  await limit(c, 'adminWrite');

  const body = trendManualSchema.parse(await c.req.json());
  const stored = await addManualSignal({
    label: body.label,
    categoryId: body.categoryId ?? null,
    score: body.score,
    rationale: body.rationale,
  });

  await logAdminAction({
    actorId: claims.sub,
    action: 'automation.trends.add',
    meta: { label: body.label, stored },
    ip: clientIp(c),
  });

  // `stored` is 0 when the unique index rejected it as already known, which is a
  // useful answer rather than an error — the operator learns it is already there.
  return c.json({ ok: true, data: { stored, duplicate: stored === 0 } }, 201);
});

automation.post('/trends/:id/dismiss', async (c) => {
  const claims = requireEditor(c);
  await limit(c, 'adminWrite');

  const id = c.req.param('id');
  await markSignals([id], 'dismissed');

  await logAdminAction({
    actorId: claims.sub,
    action: 'automation.trends.dismiss',
    targetType: 'trend_signal',
    targetId: id,
    ip: clientIp(c),
  });

  return c.json({ ok: true, data: { id, status: 'dismissed' } });
});

/* ================================== Ideas ================================ */

/**
 * Generates ideas without committing them.
 *
 * A preview step exists because the operator's judgement is cheapest to apply
 * here. Rejecting a bad theme now costs nothing; discovering it after the
 * pipeline has written a prompt and drawn an image costs a model call and an
 * image quota. The client posts whichever ideas it likes to POST /queue.
 */
automation.post('/ideas', async (c) => {
  requireEditor(c);
  await limit(c, 'aiDiscover');

  const body = ideaGenerateSchema.parse(await c.req.json().catch(() => ({})));
  const config = await getAutomationConfig();

  const ideas = await generateIdeas({
    count: body.count,
    seed: body.seed,
    categoryId: body.categoryId ?? null,
    useTrends: body.useTrends,
    config,
  });

  return c.json({ ok: true, data: { ideas, count: ideas.length } });
});

/* =================================== Logs ================================ */

automation.get('/logs', async (c) => {
  requireEditor(c);
  const params = automationLogQuerySchema.parse(query(c));
  return c.json({ ok: true, data: await listAutomationLogs(params) });
});

export default automation;
