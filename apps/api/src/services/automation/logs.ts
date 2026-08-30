import { automationLogs, db } from '@pd/db';
import type { AutomationLogLevel, AutomationLogScope } from '@pd/shared';
import { and, desc, eq, sql } from 'drizzle-orm';

import { newId } from '../../lib/crypto';
import { dayBucket, nowSec } from '../../lib/dates';

/**
 * The machine-side log.
 *
 * Deliberately separate from `admin_logs`, which is an audit trail of what
 * people did. This records what the automation did: which provider answered,
 * how long it took, and the error text when it did not answer at all.
 *
 * The gap this fills was real. A failed studio item previously left no
 * server-side trace whatsoever — the error went to the operator's browser as an
 * HTTP response and nowhere else. Once generation runs unattended on a cron
 * there is no browser to receive it, so "it stopped producing posts last
 * Tuesday" was an unanswerable question. Workers `console.error` output exists
 * but is not queryable from the admin console and rolls off quickly.
 *
 * Two rules for writers:
 *
 *   1. Never throw. A logging failure must not fail the work being logged, so
 *      every write is wrapped. Losing a log line is a nuisance; losing a
 *      generated prompt because the log table was missing is not acceptable.
 *   2. Never log a secret. `sanitise` strips anything key-shaped from metadata
 *      before it is serialised, because provider error bodies do sometimes echo
 *      request headers back.
 */

export interface LogInput {
  level?: AutomationLogLevel;
  scope: AutomationLogScope;
  message: string;
  jobId?: string | null;
  runId?: string | null;
  promptId?: string | null;
  provider?: string | null;
  model?: string | null;
  durationMs?: number | null;
  meta?: Record<string, unknown> | null;
}

/** Keys whose values must never be persisted, matched case-insensitively. */
const SECRET_KEY_PATTERN = /(key|secret|token|password|authorization|auth|bearer|cookie)/i;

/** Patterns that look like credentials even when the key name is innocent. */
const SECRET_VALUE_PATTERNS = [
  /\bAIza[0-9A-Za-z_-]{20,}\b/g, // Google API keys
  /\bsk-[A-Za-z0-9_-]{16,}\b/g, // OpenAI keys
  /\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi,
  /\brzp_(test|live)_[A-Za-z0-9]{8,}\b/g, // Razorpay
];

function scrubString(value: string): string {
  let out = value;
  for (const pattern of SECRET_VALUE_PATTERNS) out = out.replace(pattern, '[redacted]');
  return out;
}

/**
 * Recursively removes credentials from a metadata object.
 *
 * Depth-limited because provider error payloads can be deeply nested and a
 * runaway recursion inside a logger is a bad way to lose a Worker invocation.
 */
function sanitise(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (typeof value === 'string') return scrubString(value).slice(0, 600);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitise(item, depth + 1));

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? '[redacted]' : sanitise(raw, depth + 1);
    }
    return out;
  }

  return undefined;
}

export async function logAutomation(input: LogInput): Promise<void> {
  try {
    const meta = input.meta ? sanitise(input.meta) : null;

    await db.insert(automationLogs).values({
      id: newId(),
      level: input.level ?? 'info',
      scope: input.scope,
      message: scrubString(input.message).slice(0, 1000),
      jobId: input.jobId ?? null,
      runId: input.runId ?? null,
      promptId: input.promptId ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      durationMs: input.durationMs ?? null,
      metaJson: meta ? JSON.stringify(meta).slice(0, 4000) : null,
      dayBucket: dayBucket(),
      createdAt: nowSec(),
    });
  } catch (error) {
    // Last resort only. Never rethrow: see rule 1 above.
    console.warn('[automation] could not write log line:', error);
  }
}

/** Convenience wrapper — the shape most call sites want. */
export function logError(
  scope: AutomationLogScope,
  message: string,
  extra: Omit<LogInput, 'scope' | 'message' | 'level'> = {},
): Promise<void> {
  return logAutomation({ ...extra, scope, message, level: 'error' });
}

export interface LogQuery {
  level?: AutomationLogLevel;
  scope?: AutomationLogScope;
  jobId?: string;
  runId?: string;
  page?: number;
  pageSize?: number;
}

export async function listAutomationLogs(query: LogQuery = {}) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));

  const filters = [
    query.level ? eq(automationLogs.level, query.level) : undefined,
    query.scope ? eq(automationLogs.scope, query.scope) : undefined,
    query.jobId ? eq(automationLogs.jobId, query.jobId) : undefined,
    query.runId ? eq(automationLogs.runId, query.runId) : undefined,
  ].filter(Boolean);

  const where = filters.length > 0 ? and(...(filters as never[])) : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(automationLogs)
      .where(where as never)
      .orderBy(desc(automationLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: sql<number>`count(*)` })
      .from(automationLogs)
      .where(where as never),
  ]);

  return {
    items: items.map((row) => ({
      ...row,
      meta: row.metaJson ? safeParse(row.metaJson) : null,
    })),
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

/** Counts by level over the last N days — the console's health summary. */
export async function automationLogSummary(days = 7) {
  const since = nowSec() - days * 86_400;
  const rows = await db
    .select({ level: automationLogs.level, value: sql<number>`count(*)` })
    .from(automationLogs)
    .where(sql`${automationLogs.createdAt} >= ${since}`)
    .groupBy(automationLogs.level);

  const out = { info: 0, warn: 0, error: 0 };
  for (const row of rows) {
    if (row.level === 'info' || row.level === 'warn' || row.level === 'error') {
      out[row.level] = Number(row.value);
    }
  }
  return out;
}

/**
 * Drops log lines past the retention window.
 *
 * Called from nightly maintenance. Without it this table is the fastest-growing
 * thing in the schema — several rows per generated post, forever — and D1 bills
 * on rows read, so an unbounded log makes every summary query progressively more
 * expensive.
 */
export async function purgeAutomationLogs(retentionDays: number): Promise<number> {
  const cutoff = nowSec() - Math.max(1, retentionDays) * 86_400;
  const doomed = await db
    .select({ id: automationLogs.id })
    .from(automationLogs)
    .where(sql`${automationLogs.createdAt} < ${cutoff}`)
    .limit(5000);

  if (doomed.length === 0) return 0;

  await db.delete(automationLogs).where(sql`${automationLogs.createdAt} < ${cutoff}`);
  return doomed.length;
}
