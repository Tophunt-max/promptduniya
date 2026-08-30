import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
// The migration SQL, imported as raw strings and applied in filename order —
// the same order wrangler applies them in.
import migration0000 from '../../../packages/db/migrations/0000_true_mesmero.sql?raw';
import migration0001 from '../../../packages/db/migrations/0001_add_prompt_input_mode.sql?raw';
import migration0002 from '../../../packages/db/migrations/0002_content_automation.sql?raw';

const MIGRATIONS = [migration0000, migration0001, migration0002];

/**
 * Splits a migration file into individual statements.
 *
 * Two formats have to be handled. The drizzle-generated 0000 separates
 * statements with a `--> statement-breakpoint` marker. The hand-written ones use
 * plain semicolons, because they are meant to be readable and to run through
 * `wrangler d1 execute`.
 *
 * Line comments are stripped *before* splitting, which is not optional: D1's
 * `exec` wants one statement per call and the newlines get flattened to spaces to
 * get there, so a surviving `--` comment would swallow the rest of the statement
 * onto one commented-out line. The hand-written migrations are heavily commented,
 * so this is the difference between the automation tables existing in tests and
 * silently not.
 */
function splitStatements(sql: string): string[] {
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const parts = withoutComments.includes('--> statement-breakpoint')
    ? withoutComments.split('--> statement-breakpoint')
    : withoutComments.split(';');

  return parts.map((part) => part.trim().replace(/;$/, '').trim()).filter(Boolean);
}

/** Applies every migration to the local D1 test database, in order. */
export async function migrateTestDb(): Promise<void> {
  for (const migration of MIGRATIONS) {
    for (const statement of splitStatements(migration)) {
      await env.DB.exec(statement.replace(/\n/g, ' '));
    }
  }
}

/**
 * Clears all rows between tests, keeping the schema.
 *
 * Deletion order matters, because the schema has real foreign keys with
 * `ON DELETE RESTRICT` in places — `prompts.category_id` is one — so deleting
 * `categories` or `plans` before their dependants fails with
 * `FOREIGN KEY constraint failed`. `sqlite_master` returns tables in creation
 * order, which is very nearly the wrong order for this.
 *
 * Rather than hand-maintaining a topological list of forty-odd tables (which
 * silently rots the next time one is added), this sweeps repeatedly: try every
 * remaining table, keep the ones that fail, and go round again. Each pass must
 * delete at least one table or the loop stops, so a genuine cycle raises instead
 * of spinning.
 *
 * `PRAGMA foreign_keys = OFF` would be the direct fix, but D1 does not honour it
 * over the `exec` API — the constraint is enforced by the storage layer, not by a
 * connection-level setting we control.
 */
export async function truncateAll(): Promise<void> {
  const tables = (
    await env.DB.prepare(
      "select name from sqlite_master where type='table' and name not like 'sqlite_%' and name not like '_cf_%' and name != 'd1_migrations'",
    ).all<{ name: string }>()
  ).results.map((row) => row.name);

  let remaining = tables;

  while (remaining.length > 0) {
    const blocked: string[] = [];

    for (const name of remaining) {
      try {
        await env.DB.exec(`DELETE FROM ${name}`);
      } catch (error) {
        // Almost certainly a dependant row still present. Retry next pass.
        if (!/FOREIGN KEY/i.test(String(error))) throw error;
        blocked.push(name);
      }
    }

    if (blocked.length === remaining.length) {
      throw new Error(
        `Could not clear tables because of circular foreign keys: ${blocked.join(', ')}`,
      );
    }

    remaining = blocked;
  }

  await clearKv();
}

/**
 * Empties the KV namespaces.
 *
 * Necessary because rate-limit buckets live in KV, not D1, and Miniflare keeps
 * them for the whole test file. Without this, the fixed-window signup limit
 * (5/hour) is exhausted partway through a suite that registers a user per test,
 * and every later test fails with 429 — a failure that looks like a bug in the
 * code under test and is not.
 */
export async function clearKv(): Promise<void> {
  for (const namespace of [env.RATE_LIMIT, env.SESSIONS, env.CACHE]) {
    if (!namespace) continue;
    const { keys } = await namespace.list();
    for (const { name } of keys) await namespace.delete(name);
  }
}

const BASE = 'https://api.test';

export interface ApiCall {
  method?: string;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
}

/**
 * Calls the Worker with the test env bindings.
 *
 * Goes through the module's default export — `{ fetch, scheduled }` — rather than
 * Hono's `app.request()` helper. That matters beyond style: the default export is
 * what Cloudflare invokes in production, so this exercises the same entry point,
 * and `app.request` is not available on it at all (the Hono instance is not
 * exported; only its `fetch` is bound onto the default object).
 *
 * `createExecutionContext` + `waitOnExecutionContext` are required by the pool:
 * any `ctx.waitUntil` work the handler schedules must be awaited before the test
 * ends, or the runtime tears the isolate down mid-write and the assertion race is
 * genuinely unpredictable.
 */
export async function call(path: string, opts: ApiCall = {}) {
  const { default: worker } = await import('../src/index');

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...opts.headers,
  };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;

  const request = new Request(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  const ctx = createExecutionContext();
  const res = await worker.fetch(
    request,
    env as unknown as Parameters<typeof worker.fetch>[1],
    ctx,
  );
  await waitOnExecutionContext(ctx);

  const text = await res.text();
  const json = (
    text ? JSON.parse(text) : {}
  ) as { ok: boolean; data?: unknown; error?: { code: string; message: string } };

  return { status: res.status, json };
}


/**
 * Runs a service function inside the binding context.
 *
 * The service layer reaches for `db`, `useKv()` and `useAi()` from `@pd/db`,
 * which resolve out of an AsyncLocalStorage context established per request in
 * `src/index.ts`. Calling a service directly from a test skips that middleware
 * entirely, so without this wrapper every service call fails with a missing
 * request context rather than anything informative.
 *
 * This is the same thing the Worker's `scheduled()` handler has to do for cron
 * work, and for the same reason.
 */
export async function withBindings<T>(fn: () => Promise<T>): Promise<T> {
  const { runWithBindings } = await import('@pd/db');

  const raw = env as unknown as Record<string, unknown>;
  const stringEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') stringEnv[key] = value;
  }

  return runWithBindings(env as never, stringEnv, fn);
}
