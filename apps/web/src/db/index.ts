import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { env } from '@/lib/env';
import * as schema from './schema';

export type Database = LibSQLDatabase<typeof schema>;

/**
 * A single connection is reused across hot reloads in development. Without the
 * global cache Next.js would open a new libSQL client on every module refresh.
 */
const globalForDb = globalThis as unknown as {
  __pdClient?: Client;
  __pdDb?: Database;
};

function localFilePath(url: string): string | null {
  if (!url.startsWith('file:')) return null;
  return resolve(process.cwd(), url.replace(/^file:/, ''));
}

function createDbClient(): Client {
  const { DATABASE_URL, DATABASE_AUTH_TOKEN } = env();

  const filePath = localFilePath(DATABASE_URL);
  if (filePath) {
    // Ensure ./data exists before libSQL tries to open the file.
    mkdirSync(dirname(filePath), { recursive: true });
    return createClient({ url: `file:${filePath}` });
  }

  return createClient({
    url: DATABASE_URL,
    ...(DATABASE_AUTH_TOKEN ? { authToken: DATABASE_AUTH_TOKEN } : {}),
  });
}

export function getClient(): Client {
  globalForDb.__pdClient ??= createDbClient();
  return globalForDb.__pdClient;
}

export function getDb(): Database {
  globalForDb.__pdDb ??= drizzle(getClient(), { schema, logger: false });
  return globalForDb.__pdDb;
}

/**
 * Proxy so callers can `import { db } from '@/db'` without triggering a
 * connection at module-evaluation time (important for build-time imports).
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
  has(_target, prop) {
    return Reflect.has(getDb() as object, prop);
  },
});

export { schema };
export * from './schema';
