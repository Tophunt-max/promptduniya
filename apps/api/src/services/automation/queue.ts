import { automationRuns, categories, contentQueue, db, prompts } from '@pd/db';
import { QUEUE_TERMINAL_STATUSES, type QueueSource, type QueueStatus } from '@pd/shared';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { newId } from '../../lib/crypto';
import { nowSec } from '../../lib/dates';
import { AppError } from '../../lib/errors';
import { logAutomation } from './logs';

/**
 * The durable content queue.
 *
 * This is what turns the studio from an operator tool into a pipeline. The
 * previous batch mechanism lived entirely in React state in `pages/studio.tsx`:
 * the browser looped over themes and POSTed them one at a time. That worked while
 * a human was watching, and had three problems that made automation impossible.
 * A closed tab lost the run. A failure could not be retried without retyping the
 * brief. And a cron trigger has no browser to run the loop in.
 *
 * A row here is the unit of work: it carries the full brief, the stage it reached,
 * how many attempts it has had, and its outcome. The runner claims rows; nothing
 * about the process depends on a client staying connected.
 *
 * On claiming, and why there is no lock
 * -------------------------------------
 * `claimNext` does a conditional UPDATE — set status to 'generating' only if the
 * row is still pending — and treats "no rows changed" as "someone else got it".
 * That is compare-and-swap, which is the strongest primitive available: D1 has no
 * SELECT ... FOR UPDATE, and Cloudflare cron does not overlap invocations for the
 * same trigger, so genuine contention only arises when an operator presses
 * "process now" while a tick is running. CAS handles exactly that case, without
 * introducing a Durable Object for a race that costs one duplicated post at
 * worst. `lib/rate-limit.ts` makes the same trade for the same reason.
 */

/* -------------------------------- Enqueueing ------------------------------- */

export interface EnqueueInput {
  themes: string[];
  categoryId: string;
  aiModel: string;
  inputMode: string;
  isPremium: boolean;
  publishMode: 'draft' | 'publish' | 'schedule';
  scheduledFor?: number | null;
  skipCover?: boolean;
  priority?: number;
  source: QueueSource;
  runId?: string | null;
  trendSignalId?: string | null;
  maxAttempts?: number;
  createdBy?: string | null;
}

export interface EnqueuedItem {
  id: string;
  theme: string;
}

export async function enqueue(input: EnqueueInput): Promise<EnqueuedItem[]> {
  const category = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .limit(1);
  if (!category[0]) throw AppError.badRequest('Unknown category');

  const themes = input.themes
    .map((theme) => theme.trim())
    .filter((theme) => theme.length >= 3)
    // De-duplicate within the batch. Enqueueing the same theme twice guarantees
    // one of the two will be rejected by the duplicate gate after paying for a
    // full generation, which is the most expensive way to discover it.
    .filter((theme, index, all) => all.findIndex((t) => t.toLowerCase() === theme.toLowerCase()) === index);

  if (themes.length === 0) throw AppError.badRequest('No usable themes were supplied');

  const now = nowSec();
  const rows = themes.map((theme) => ({
    id: newId(),
    runId: input.runId ?? null,
    trendSignalId: input.trendSignalId ?? null,
    theme: theme.slice(0, 200),
    categoryId: input.categoryId,
    aiModel: input.aiModel,
    inputMode: input.inputMode,
    isPremium: input.isPremium,
    publishMode: input.publishMode,
    scheduledFor: input.scheduledFor ?? null,
    skipCover: input.skipCover ?? false,
    status: 'queued' as const,
    source: input.source,
    priority: input.priority ?? 0,
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  }));

  // Chunked to stay under D1's bound-parameter ceiling; a row here is wide.
  for (let i = 0; i < rows.length; i += 15) {
    await db.insert(contentQueue).values(rows.slice(i, i + 15));
  }

  await logAutomation({
    scope: 'queue',
    message: `Queued ${rows.length} item(s) from ${input.source}`,
    runId: input.runId ?? null,
    meta: { count: rows.length, publishMode: input.publishMode },
  });

  return rows.map((row) => ({ id: row.id, theme: row.theme }));
}

/* --------------------------------- Claiming ------------------------------- */

export interface ClaimedItem {
  id: string;
  theme: string;
  categoryId: string;
  aiModel: string;
  inputMode: string;
  isPremium: boolean;
  publishMode: 'draft' | 'publish' | 'schedule';
  scheduledFor: number | null;
  skipCover: boolean;
  attempts: number;
  maxAttempts: number;
  runId: string | null;
  trendSignalId: string | null;
  createdBy: string | null;
}

/**
 * Atomically takes the next pending item, or returns null if there is none.
 *
 * The WHERE clause re-asserts the pending status inside the UPDATE, so two
 * concurrent callers cannot both take the same row: the second one's update
 * matches nothing because the first already moved the status to 'generating'.
 * `meta.changes` is how D1 reports that, and it is the whole basis of the lock.
 */
export async function claimNext(runId: string | null): Promise<ClaimedItem | null> {
  const candidates = await db
    .select({
      id: contentQueue.id,
      theme: contentQueue.theme,
      categoryId: contentQueue.categoryId,
      aiModel: contentQueue.aiModel,
      inputMode: contentQueue.inputMode,
      isPremium: contentQueue.isPremium,
      publishMode: contentQueue.publishMode,
      scheduledFor: contentQueue.scheduledFor,
      skipCover: contentQueue.skipCover,
      attempts: contentQueue.attempts,
      maxAttempts: contentQueue.maxAttempts,
      runId: contentQueue.runId,
      trendSignalId: contentQueue.trendSignalId,
      createdBy: contentQueue.createdBy,
    })
    .from(contentQueue)
    .where(eq(contentQueue.status, 'queued'))
    .orderBy(desc(contentQueue.priority), asc(contentQueue.createdAt))
    .limit(5);

  for (const candidate of candidates) {
    const now = nowSec();
    const result = await db
      .update(contentQueue)
      .set({
        status: 'generating',
        attempts: candidate.attempts + 1,
        startedAt: now,
        updatedAt: now,
        // Re-stamp the run so the history attributes the work to whoever is
        // actually doing it, not to whoever queued it.
        ...(runId ? { runId } : {}),
        lastError: null,
      })
      .where(and(eq(contentQueue.id, candidate.id), eq(contentQueue.status, 'queued')))
      .returning({ id: contentQueue.id });

    // Lost the race for this row — try the next candidate rather than giving up,
    // otherwise a contended queue makes no progress at all.
    if (result.length === 0) continue;

    return {
      ...candidate,
      attempts: candidate.attempts + 1,
      runId: runId ?? candidate.runId,
      publishMode: candidate.publishMode as ClaimedItem['publishMode'],
    };
  }

  return null;
}

/* ------------------------------- Transitions ------------------------------ */

export interface CompletionInput {
  promptId?: string | null;
  qualityScore?: number | null;
  qualityReport?: unknown;
  duplicateOfId?: string | null;
  duplicateScore?: number | null;
  textEngine?: string | null;
  imageEngine?: string | null;
  coverError?: string | null;
  scheduledFor?: number | null;
  lastError?: string | null;
}

/** Moves an item to a settled state and records everything learned on the way. */
export async function settle(
  id: string,
  status: QueueStatus,
  outcome: CompletionInput = {},
): Promise<void> {
  const now = nowSec();
  await db
    .update(contentQueue)
    .set({
      status,
      promptId: outcome.promptId ?? undefined,
      qualityScore: outcome.qualityScore ?? undefined,
      qualityReportJson: outcome.qualityReport
        ? JSON.stringify(outcome.qualityReport).slice(0, 6000)
        : undefined,
      duplicateOfId: outcome.duplicateOfId ?? undefined,
      duplicateScore: outcome.duplicateScore ?? undefined,
      textEngine: outcome.textEngine ?? undefined,
      imageEngine: outcome.imageEngine ?? undefined,
      coverError: outcome.coverError ?? undefined,
      scheduledFor: outcome.scheduledFor ?? undefined,
      lastError: outcome.lastError ?? undefined,
      finishedAt: now,
      updatedAt: now,
    })
    .where(eq(contentQueue.id, id));
}

/**
 * Records a failure, returning the item to the queue if attempts remain.
 *
 * Retry lives here rather than in the runner so the decision is made in one
 * place against the row's own attempt count. A transient provider error should
 * cost a retry on the next tick; a persistently failing item should stop
 * consuming the budget and become visible in the console instead.
 */
export async function fail(
  id: string,
  error: unknown,
  context: { runId?: string | null } = {},
): Promise<{ willRetry: boolean; attempts: number }> {
  const message = error instanceof Error ? error.message : String(error);

  const rows = await db
    .select({ attempts: contentQueue.attempts, maxAttempts: contentQueue.maxAttempts })
    .from(contentQueue)
    .where(eq(contentQueue.id, id))
    .limit(1);

  const row = rows[0];
  const attempts = row?.attempts ?? 1;
  const maxAttempts = row?.maxAttempts ?? 3;
  const willRetry = attempts < maxAttempts;

  const now = nowSec();
  await db
    .update(contentQueue)
    .set({
      status: willRetry ? 'queued' : 'failed',
      lastError: message.slice(0, 1000),
      // Deprioritise a retry so it does not head-of-line block fresh work on the
      // next tick — a repeatedly failing theme would otherwise be picked first
      // every time and starve everything behind it.
      priority: willRetry ? sql`${contentQueue.priority} - 1` : undefined,
      finishedAt: willRetry ? null : now,
      updatedAt: now,
    })
    .where(eq(contentQueue.id, id));

  await logAutomation({
    scope: 'queue',
    level: willRetry ? 'warn' : 'error',
    message: willRetry
      ? `Attempt ${attempts}/${maxAttempts} failed, will retry: ${message}`
      : `Gave up after ${attempts} attempt(s): ${message}`,
    jobId: id,
    runId: context.runId ?? null,
  });

  return { willRetry, attempts };
}

/** Puts a failed or held item back in line, resetting its attempt budget. */
export async function retry(id: string, extraAttempts = 2): Promise<void> {
  const rows = await db
    .select({ status: contentQueue.status, attempts: contentQueue.attempts })
    .from(contentQueue)
    .where(eq(contentQueue.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) throw AppError.notFound('Queue item not found');
  if (row.status === 'published') {
    throw AppError.badRequest('This item already published. Regenerate the prompt instead.');
  }

  const now = nowSec();
  await db
    .update(contentQueue)
    .set({
      status: 'queued',
      maxAttempts: row.attempts + extraAttempts,
      lastError: null,
      finishedAt: null,
      // Retries requested by a human jump the queue: someone is waiting on it.
      priority: 5,
      updatedAt: now,
    })
    .where(eq(contentQueue.id, id));

  await logAutomation({ scope: 'queue', message: 'Requeued by an operator', jobId: id });
}

export async function cancel(id: string): Promise<void> {
  const rows = await db
    .select({ status: contentQueue.status })
    .from(contentQueue)
    .where(eq(contentQueue.id, id))
    .limit(1);

  if (!rows[0]) throw AppError.notFound('Queue item not found');
  if (rows[0].status === 'generating') {
    // The runner holds this row and will write to it when it finishes. Marking
    // it cancelled now would be overwritten seconds later, so refuse clearly
    // rather than appear to work.
    throw AppError.badRequest('This item is generating right now. Wait for it to finish.');
  }

  await settle(id, 'cancelled');
  await logAutomation({ scope: 'queue', message: 'Cancelled by an operator', jobId: id });
}

/* --------------------------------- Reading -------------------------------- */

export interface QueueQuery {
  status?: QueueStatus;
  source?: QueueSource;
  runId?: string;
  page?: number;
  pageSize?: number;
}

export async function listQueue(query: QueueQuery = {}) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));

  const filters = [
    query.status ? eq(contentQueue.status, query.status) : undefined,
    query.source ? eq(contentQueue.source, query.source) : undefined,
    query.runId ? eq(contentQueue.runId, query.runId) : undefined,
  ].filter(Boolean);

  const where = filters.length > 0 ? and(...(filters as never[])) : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: contentQueue.id,
        theme: contentQueue.theme,
        status: contentQueue.status,
        source: contentQueue.source,
        priority: contentQueue.priority,
        attempts: contentQueue.attempts,
        maxAttempts: contentQueue.maxAttempts,
        inputMode: contentQueue.inputMode,
        isPremium: contentQueue.isPremium,
        publishMode: contentQueue.publishMode,
        scheduledFor: contentQueue.scheduledFor,
        qualityScore: contentQueue.qualityScore,
        qualityReportJson: contentQueue.qualityReportJson,
        duplicateOfId: contentQueue.duplicateOfId,
        duplicateScore: contentQueue.duplicateScore,
        textEngine: contentQueue.textEngine,
        imageEngine: contentQueue.imageEngine,
        coverError: contentQueue.coverError,
        lastError: contentQueue.lastError,
        promptId: contentQueue.promptId,
        promptSlug: prompts.slug,
        promptTitle: prompts.title,
        coverImageUrl: prompts.coverImageUrl,
        categoryName: categories.name,
        runId: contentQueue.runId,
        createdAt: contentQueue.createdAt,
        startedAt: contentQueue.startedAt,
        finishedAt: contentQueue.finishedAt,
      })
      .from(contentQueue)
      .leftJoin(prompts, eq(contentQueue.promptId, prompts.id))
      .leftJoin(categories, eq(contentQueue.categoryId, categories.id))
      .where(where as never)
      .orderBy(desc(contentQueue.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: sql<number>`count(*)` })
      .from(contentQueue)
      .where(where as never),
  ]);

  return {
    items: items.map((row) => {
      const { qualityReportJson, ...rest } = row;
      return {
        ...rest,
        qualityReport: qualityReportJson ? safeParse(qualityReportJson) : null,
      };
    }),
    page,
    pageSize,
    total: Number(totalRows[0]?.value ?? 0),
  };
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function getQueueItem(id: string) {
  const rows = await db.select().from(contentQueue).where(eq(contentQueue.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Every status with a count, including zeroes, so the console can render tabs. */
export async function queueCounts(): Promise<Record<QueueStatus, number>> {
  const rows = await db
    .select({ status: contentQueue.status, value: sql<number>`count(*)` })
    .from(contentQueue)
    .groupBy(contentQueue.status);

  const out = {} as Record<QueueStatus, number>;
  for (const status of [
    'queued',
    'generating',
    'generated',
    'quality_check',
    'needs_review',
    'approved',
    'scheduled',
    'published',
    'failed',
    'cancelled',
    'duplicate',
  ] as QueueStatus[]) {
    out[status] = 0;
  }
  for (const row of rows) out[row.status as QueueStatus] = Number(row.value);
  return out;
}

export async function pendingCount(): Promise<number> {
  const rows = await db
    .select({ value: sql<number>`count(*)` })
    .from(contentQueue)
    .where(eq(contentQueue.status, 'queued'));
  return Number(rows[0]?.value ?? 0);
}

/**
 * How many items this run produced today, at the operator's local day boundary.
 *
 * Counts queue rows rather than published prompts, because the cap is on what the
 * automation *generated* — an item held for review still consumed a model call
 * and still counts against the day's budget.
 */
export async function producedSince(since: number): Promise<number> {
  const rows = await db
    .select({ value: sql<number>`count(*)` })
    .from(contentQueue)
    .where(
      and(
        eq(contentQueue.source, 'automation'),
        sql`${contentQueue.createdAt} >= ${since}`,
        inArray(contentQueue.status, [
          'generated',
          'needs_review',
          'approved',
          'scheduled',
          'published',
          'duplicate',
        ]),
      ),
    );
  return Number(rows[0]?.value ?? 0);
}

/**
 * Releases items stuck in 'generating'.
 *
 * A Worker invocation can be killed mid-item — a CPU limit, an eviction, a deploy
 * — and the row it held would otherwise sit in 'generating' forever, invisible to
 * `claimNext` and to any retry. Nothing else would ever free it, so nightly
 * maintenance sweeps anything that has been claimed implausibly long.
 */
export async function releaseStalled(olderThanSeconds = 1_800): Promise<number> {
  const cutoff = nowSec() - olderThanSeconds;
  const stalled = await db
    .select({ id: contentQueue.id, attempts: contentQueue.attempts, maxAttempts: contentQueue.maxAttempts })
    .from(contentQueue)
    .where(and(eq(contentQueue.status, 'generating'), sql`${contentQueue.startedAt} < ${cutoff}`))
    .limit(100);

  if (stalled.length === 0) return 0;

  for (const item of stalled) {
    const exhausted = item.attempts >= item.maxAttempts;
    await db
      .update(contentQueue)
      .set({
        status: exhausted ? 'failed' : 'queued',
        lastError: 'The worker did not finish this item; it was released by maintenance.',
        updatedAt: nowSec(),
      })
      .where(and(eq(contentQueue.id, item.id), eq(contentQueue.status, 'generating')));
  }

  await logAutomation({
    scope: 'queue',
    level: 'warn',
    message: `Released ${stalled.length} stalled item(s)`,
  });

  return stalled.length;
}

/** True when an item can no longer move on its own. */
export function isTerminal(status: QueueStatus): boolean {
  return (QUEUE_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/* ------------------------------- Run records ------------------------------ */

export interface StartRunInput {
  trigger: 'cron' | 'manual' | 'api';
  requested: number;
  triggeredBy?: string | null;
  meta?: Record<string, unknown>;
}

export async function startRun(input: StartRunInput): Promise<string> {
  const id = newId();
  const now = nowSec();

  await db.insert(automationRuns).values({
    id,
    trigger: input.trigger,
    status: 'running',
    requested: input.requested,
    startedAt: now,
    triggeredBy: input.triggeredBy ?? null,
    metaJson: input.meta ? JSON.stringify(input.meta).slice(0, 2000) : null,
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

export interface FinishRunInput {
  queued?: number;
  succeeded: number;
  failed: number;
  skipped: number;
  stopReason?: string | null;
}

export async function finishRun(id: string, outcome: FinishRunInput): Promise<void> {
  const rows = await db
    .select({ startedAt: automationRuns.startedAt })
    .from(automationRuns)
    .where(eq(automationRuns.id, id))
    .limit(1);

  const now = nowSec();
  const startedAt = rows[0]?.startedAt ?? now;

  // 'partial' rather than 'completed' whenever anything failed, so the history
  // list distinguishes a clean run from one that limped. A run that produced
  // nothing at all and failed at least once is a failure outright.
  const status =
    outcome.failed === 0
      ? 'completed'
      : outcome.succeeded === 0
        ? 'failed'
        : 'partial';

  await db
    .update(automationRuns)
    .set({
      status,
      queued: outcome.queued ?? 0,
      succeeded: outcome.succeeded,
      failed: outcome.failed,
      skipped: outcome.skipped,
      stopReason: outcome.stopReason ?? null,
      finishedAt: now,
      durationMs: (now - startedAt) * 1000,
      updatedAt: now,
    })
    .where(eq(automationRuns.id, id));
}

/** Marks a run that never did any work, e.g. automation disabled or off-slot. */
export async function skipRun(id: string, reason: string): Promise<void> {
  const now = nowSec();
  await db
    .update(automationRuns)
    .set({ status: 'skipped', stopReason: reason, finishedAt: now, updatedAt: now })
    .where(eq(automationRuns.id, id));
}

export async function listRuns(options: { page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(automationRuns)
      .orderBy(desc(automationRuns.startedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: sql<number>`count(*)` }).from(automationRuns),
  ]);

  return {
    items: items.map((row) => {
      const { metaJson, ...rest } = row;
      return { ...rest, meta: metaJson ? safeParse(metaJson) : null };
    }),
    page,
    pageSize,
    total: Number(totalRows[0]?.value ?? 0),
  };
}
