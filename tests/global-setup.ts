import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Runs once per `vitest` invocation, before any worker starts.
 *
 * The database file is removed here rather than in `setup.ts` — that file runs
 * once per test file, and deleting the SQLite file underneath an open
 * connection produces SQLITE_READONLY_DBMOVED.
 */
export default function globalSetup() {
  const directory = resolve(process.cwd(), '.vitest');
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
}
