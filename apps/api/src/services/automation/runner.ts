import { DuplicateContentError, runStudioPipeline } from '../studio/pipeline';
import { nowSec } from '../../lib/dates';
import { generateIdeas } from './ideas';
import { logAutomation, logError } from './logs';
import { discoverTrends, markSignals, takeUnusedSignals } from './trends';
import {
  claimNext,
  enqueue,
  fail,
  finishRun,
  pendingCount,
  producedSince,
  settle,
  skipRun,
  startRun,
} from './queue';
import {
  getAutomationConfig,
  localDayBucket,
  localHour,
  slotAllowance,
  type AutomationConfig,
} from './config';

/**
 * The orchestrator.
 *
 * Everything else in this directory does one job well; this decides when those
 * jobs happen and stops the whole thing running away.
 *
 * A cycle:
 *
 *   1. decide whether to run at all (enabled? right hour? day's cap met?)
 *   2. top up the queue from trends if it is empty
 *   3. drain the queue, one item at a time, until the budget runs out
 *   4. record the run
 *
 * Two limits, and both are load-bearing
 * -------------------------------------
 * A Worker invocation is not free-running: it has a wall-clock ceiling, and a
 * cron tick that overruns is killed mid-item. So a run stops on whichever comes
 * first of `maxPerRun` items or `runBudgetSeconds` of elapsed time. The time
 * budget is the important one — item duration is set by whichever provider
 * answers and can vary by an order of magnitude between Workers AI and a cold
 * Gemini call, so a count alone cannot bound the run.
 *
 * The check happens *before* claiming the next item rather than after finishing
 * one, using the slowest observed item as the estimate. Claiming an item and
 * being killed before settling it leaves a row stuck in 'generating' until
 * maintenance sweeps it, which is recoverable but wasteful.
 *
 * Why items run sequentially
 * --------------------------
 * `Promise.all` over four items would be faster in wall-clock terms and worse in
 * every other way. All the providers here are quota-limited per account, so
 * parallel calls contend for the same budget and fail together rather than
 * degrading one at a time. Sequential execution also means the day's cap is
 * respected exactly, and a run killed partway leaves completed work committed
 * rather than four half-finished rows.
 */

export interface CycleOptions {
  trigger: 'cron' | 'manual' | 'api';
  /** Overrides config.maxPerRun. */
  limit?: number;
  /** Overrides config.runBudgetSeconds. */
  budgetSeconds?: number;
  /** Queue fresh ideas even if the queue already has work. */
  topUp?: boolean;
  /** Bypass the enabled flag and the hour check — an operator asked for this. */
  force?: boolean;
  triggeredBy?: string | null;
}

export interface CycleResult {
  runId: string | null;
  ran: boolean;
  queued: number;
  succeeded: number;
  failed: number;
  skipped: number;
  stopReason: string;
  /** Prompts created, for the console to link to. */
  created: { promptId: string; title: string; slug: string; score: number; held: boolean }[];
}

function idle(reason: string): CycleResult {
  return {
    runId: null,
    ran: false,
    queued: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    stopReason: reason,
    created: [],
  };
}

/**
 * Whether this tick is a scheduled generation slot.
 *
 * The Worker ticks hourly; only the configured hours do work. Exported so the
 * admin overview can show the operator when the next run is due without
 * duplicating the arithmetic.
 */
export function isScheduledSlot(config: AutomationConfig, at = nowSec()): boolean {
  return config.publishHours.includes(localHour(at, config.timezoneOffsetMinutes));
}

/** Next slot as a unix timestamp, for the "next run" line in the console. */
export function nextSlotAt(config: AutomationConfig, at = nowSec()): number | null {
  if (config.publishHours.length === 0) return null;

  const currentHour = localHour(at, config.timezoneOffsetMinutes);
  const upcoming = config.publishHours.find((hour) => hour > currentHour);

  // Truncate to the top of the hour so the answer is the slot, not "now plus n".
  const base = at - (at % 3600);
  if (upcoming !== undefined) return base + (upcoming - currentHour) * 3600;

  const first = config.publishHours[0]!;
  return base + (24 - currentHour + first) * 3600;
}

/**
 * Fills the queue from trend signals.
 *
 * Discovery runs first only when there is nothing left to work from, because a
 * discovery pass costs a model call of its own and the signals it produces stay
 * valid for days. Re-scanning on every tick would spend budget rediscovering what
 * is already in the table.
 */
async function topUpQueue(
  config: AutomationConfig,
  want: number,
  runId: string,
): Promise<number> {
  if (want <= 0) return 0;

  let signals = await takeUnusedSignals(want);

  if (signals.length === 0 && config.trendDiscovery) {
    await discoverTrends({ aiCount: Math.max(8, want * 2) });
    signals = await takeUnusedSignals(want);
  }

  if (signals.length === 0) return 0;

  let ideas;
  try {
    ideas = await generateIdeas({ count: want, useTrends: true, config });
  } catch (error) {
    await logError('idea', 'Could not turn trend signals into ideas', {
      runId,
      meta: { error: error instanceof Error ? error.message : String(error) },
    });
    return 0;
  }

  if (ideas.length === 0) return 0;

  // Grouped by the fields that vary per idea so each group is a single insert.
  // Category, premium flag and input mode all differ across a batch, so one
  // enqueue call per idea would be correct but chatty; grouping keeps the row
  // count identical with far fewer statements.
  const groups = new Map<string, typeof ideas>();
  for (const idea of ideas) {
    const key = `${idea.categoryId}|${idea.inputMode}|${idea.isPremium}|${idea.aiModel}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(idea);
    else groups.set(key, [idea]);
  }

  let queued = 0;

  for (const group of groups.values()) {
    const first = group[0]!;
    try {
      const items = await enqueue({
        themes: group.map((idea) => idea.theme),
        categoryId: first.categoryId,
        aiModel: first.aiModel,
        inputMode: first.inputMode,
        isPremium: first.isPremium,
        // An automated item never publishes straight from the queue; the pipeline
        // decides after scoring. `autoPublish` is what promotes a passing item.
        publishMode: config.autoPublish ? config.publishMode : 'draft',
        skipCover: !config.autoImages,
        source: 'automation',
        runId,
        maxAttempts: config.maxAttempts,
      });
      queued += items.length;
    } catch (error) {
      await logError('queue', 'Could not enqueue a group of generated ideas', {
        runId,
        meta: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  // Only mark signals used once something is actually queued, so a failed
  // enqueue leaves them available for the next tick.
  const usedSignalIds = ideas
    .map((idea) => idea.trendSignalId)
    .filter((id): id is string => Boolean(id));
  if (queued > 0 && usedSignalIds.length > 0) await markSignals(usedSignalIds, 'used');

  return queued;
}

/* ------------------------------- The cycle -------------------------------- */

export async function runAutomationCycle(options: CycleOptions): Promise<CycleResult> {
  const config = await getAutomationConfig();
  const startedAt = Date.now();

  /* ---------------------------- 1. Should we run? --------------------------- */

  if (!config.enabled && !options.force) {
    return idle('Automation is switched off');
  }

  if (options.trigger === 'cron' && !options.force && !isScheduledSlot(config)) {
    return idle('Not a scheduled slot');
  }

  const dayStart = (() => {
    // Midnight at the operator's offset, expressed in unix seconds.
    const bucket = localDayBucket(nowSec(), config.timezoneOffsetMinutes);
    return Math.floor(Date.parse(`${bucket}T00:00:00Z`) / 1000) - config.timezoneOffsetMinutes * 60;
  })();

  const producedToday = await producedSince(dayStart);
  const remainingToday = config.postsPerDay - producedToday;

  if (remainingToday <= 0 && !options.force) {
    return idle(`Daily cap reached (${producedToday}/${config.postsPerDay})`);
  }

  const limit = Math.max(
    1,
    Math.min(
      options.limit ?? slotAllowance(config),
      config.maxPerRun,
      options.force ? Number.MAX_SAFE_INTEGER : Math.max(1, remainingToday),
    ),
  );

  const budgetMs = (options.budgetSeconds ?? config.runBudgetSeconds) * 1000;

  const runId = await startRun({
    trigger: options.trigger,
    requested: limit,
    triggeredBy: options.triggeredBy ?? null,
    meta: {
      limit,
      budgetSeconds: Math.round(budgetMs / 1000),
      producedToday,
      postsPerDay: config.postsPerDay,
      autoPublish: config.autoPublish,
      minQualityScore: config.minQualityScore,
    },
  });

  /* ------------------------------ 2. Top up -------------------------------- */

  let queued = 0;
  const pending = await pendingCount();

  if (pending < limit || options.topUp) {
    queued = await topUpQueue(config, limit - Math.min(pending, limit) || limit, runId);
  }

  if (pending === 0 && queued === 0) {
    await skipRun(runId, 'Nothing to work on and no ideas could be generated');
    return {
      ...idle('Nothing to work on and no ideas could be generated'),
      runId,
      ran: false,
    };
  }

  /* ------------------------------- 3. Drain -------------------------------- */

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let stopReason = 'Completed the requested number of items';
  const created: CycleResult['created'] = [];

  // Seeded so the first iteration's budget check is not comparing against zero
  // and immediately concluding it has time for one more item it does not have.
  let slowestItemMs = 45_000;

  for (let processed = 0; processed < limit; processed += 1) {
    const elapsed = Date.now() - startedAt;
    if (elapsed + slowestItemMs > budgetMs) {
      stopReason = `Out of time after ${processed} item(s) (${Math.round(elapsed / 1000)}s of ${Math.round(budgetMs / 1000)}s)`;
      break;
    }

    const item = await claimNext(runId);
    if (!item) {
      stopReason = `Queue empty after ${processed} item(s)`;
      break;
    }

    const itemStarted = Date.now();

    try {
      const result = await runStudioPipeline({
        theme: item.theme,
        categoryId: item.categoryId,
        aiModel: item.aiModel,
        inputMode: item.inputMode,
        isPremium: item.isPremium,
        publishMode: item.publishMode,
        scheduledFor: item.scheduledFor,
        skipCover: item.skipCover,
        authorId: item.createdBy,
        minQualityScore: config.minQualityScore,
        duplicateThreshold: config.duplicateDetection ? config.duplicateThreshold : undefined,
      });

      // The prompt exists either way; the status records what happens to it.
      const status = result.heldForReview
        ? 'needs_review'
        : result.published
          ? 'published'
          : result.scheduledFor
            ? 'scheduled'
            : 'generated';

      await settle(item.id, status, {
        promptId: result.promptId,
        qualityScore: result.quality.score,
        qualityReport: {
          score: result.quality.score,
          blocked: result.quality.blocked,
          summary: result.quality.summary,
          failed: result.quality.failed,
          checks: result.quality.checks.map((check) => ({
            id: check.id,
            label: check.label,
            passed: check.passed,
            ...(check.detail && !check.passed ? { detail: check.detail } : {}),
          })),
        },
        textEngine: result.textEngine,
        imageEngine: result.imageEngine,
        coverError: result.coverError,
        scheduledFor: result.scheduledFor,
        lastError: result.holdReason,
      });

      succeeded += 1;
      created.push({
        promptId: result.promptId,
        title: result.title,
        slug: result.slug,
        score: result.quality.score,
        held: result.heldForReview,
      });

      await logAutomation({
        scope: 'publish',
        level: result.heldForReview ? 'warn' : 'info',
        message: result.heldForReview
          ? `Held "${result.title}" for review: ${result.holdReason}`
          : `Created "${result.title}" (score ${result.quality.score}, ${status})`,
        jobId: item.id,
        runId,
        promptId: result.promptId,
        provider: result.textEngine,
        model: result.imageEngine ?? undefined,
        durationMs: Date.now() - itemStarted,
      });
    } catch (error) {
      // A duplicate is a correct outcome, not a failure. It must not consume a
      // retry, and it must not count against the run's health — a run that
      // rejected three duplicates worked exactly as intended.
      if (error instanceof DuplicateContentError) {
        await settle(item.id, 'duplicate', {
          duplicateOfId: error.match.promptId,
          duplicateScore: error.match.score,
          lastError: error.message,
        });
        skipped += 1;

        await logAutomation({
          scope: 'duplicate',
          level: 'info',
          message: `Rejected "${item.theme}" — ${error.message}`,
          jobId: item.id,
          runId,
          durationMs: Date.now() - itemStarted,
        });
      } else {
        await fail(item.id, error, { runId });
        failed += 1;
      }
    }

    slowestItemMs = Math.max(slowestItemMs, Date.now() - itemStarted);
  }

  await finishRun(runId, { queued, succeeded, failed, skipped, stopReason });

  await logAutomation({
    scope: 'cron',
    level: failed > 0 ? 'warn' : 'info',
    message: `Run finished: ${succeeded} created, ${failed} failed, ${skipped} skipped. ${stopReason}`,
    runId,
    durationMs: Date.now() - startedAt,
    meta: { queued, trigger: options.trigger },
  });

  return { runId, ran: true, queued, succeeded, failed, skipped, stopReason, created };
}

/**
 * The hourly cron entry point.
 *
 * Deliberately swallows its own errors. A thrown exception here would abort the
 * scheduled handler, and this shares that invocation with site maintenance —
 * publishing scheduled prompts and expiring subscriptions must not stop because
 * an AI provider was down.
 */
export async function automationTick(): Promise<CycleResult> {
  try {
    return await runAutomationCycle({ trigger: 'cron' });
  } catch (error) {
    await logError('cron', 'The automation tick failed outright', {
      meta: { error: error instanceof Error ? error.message : String(error) },
    });
    return idle('The tick failed; see the automation log');
  }
}
