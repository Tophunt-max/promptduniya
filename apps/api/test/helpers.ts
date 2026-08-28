import { env } from 'cloudflare:test';
// The generated migration SQL, imported as a raw string.
import migrationSql from '../../../packages/db/migrations/0000_true_mesmero.sql?raw';

/**
 * Applies the Drizzle-generated schema to the local D1 test database.
 *
 * drizzle-kit separates statements with a `--> statement-breakpoint` marker;
 * D1's exec runs one statement at a time, so we split and run each.
 */
export async function migrateTestDb(): Promise<void> {
  const statements = migrationSql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await env.DB.exec(statement.replace(/\n/g, ' '));
  }
}

/** Clears all rows between tests (keeps the schema). */
export async function truncateAll(): Promise<void> {
  const tables = (
    await env.DB.prepare(
      "select name from sqlite_master where type='table' and name not like 'sqlite_%' and name not like '_cf_%' and name != 'd1_migrations'",
    ).all<{ name: string }>()
  ).results;
  for (const { name } of tables) {
    await env.DB.exec(`DELETE FROM ${name}`);
  }
}

const BASE = 'https://api.test';

export interface ApiCall {
  method?: string;
  body?: unknown;
  token?: string;
}

/** Calls the Worker app with the test env bindings. */
export async function call(path: string, opts: ApiCall = {}) {
  const { default: app } = await import('../src/index');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;

  const res = await app.request(
    `${BASE}${path}`,
    {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    },
    env as unknown as Record<string, unknown>,
  );

  const json = (await res.json()) as { ok: boolean; data?: unknown; error?: { code: string; message: string } };
  return { status: res.status, json };
}
