import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types';

import * as schema from './schema';

/**
 * Request-scoped database and binding context.
 *
 * On Cloudflare, D1/KV/R2 are per-request bindings on the Worker `env`, not a
 * global connection string. Rather than thread a context object through every
 * service signature, we hold it in AsyncLocalStorage for the lifetime of the
 * request (supported on Workers with the `nodejs_compat` flag). Services then
 * keep importing `db` from `@pd/db` exactly as before.
 */

export type Database = DrizzleD1Database<typeof schema>;

export interface CloudflareBindings {
  DB: D1Database;
  RATE_LIMIT: KVNamespace;
  SESSIONS: KVNamespace;
  CACHE: KVNamespace;
  MEDIA: R2Bucket;
  [key: string]: unknown;
}

export interface RequestContext {
  db: Database;
  kv: {
    rateLimit: KVNamespace;
    sessions: KVNamespace;
    cache: KVNamespace;
  };
  r2: R2Bucket;
  env: Record<string, string | undefined>;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Builds a context from raw Worker bindings and runs `fn` inside it. */
export function runWithBindings<T>(
  bindings: CloudflareBindings,
  env: Record<string, string | undefined>,
  fn: () => T,
): T {
  const ctx: RequestContext = {
    db: drizzle(bindings.DB, { schema, logger: false }),
    kv: {
      rateLimit: bindings.RATE_LIMIT,
      sessions: bindings.SESSIONS,
      cache: bindings.CACHE,
    },
    r2: bindings.MEDIA,
    env,
  };
  return storage.run(ctx, fn);
}

/** Runs `fn` inside an already-built context (used by tests and jobs). */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function useRequestContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error(
      'No request context. Wrap the call in runWithBindings()/runWithContext() — ' +
        'this usually means a service was called outside the API request lifecycle.',
    );
  }
  return ctx;
}

export function useKv() {
  return useRequestContext().kv;
}

export function useR2(): R2Bucket {
  return useRequestContext().r2;
}

export function useEnv(): Record<string, string | undefined> {
  return useRequestContext().env;
}

/**
 * The Drizzle handle for the current request. Callers use `db.select()…` just
 * like the monolith did; under the hood it resolves to the request's D1 binding.
 */
export const db: Database = new Proxy({} as Database, {
  get(_t, prop, receiver) {
    return Reflect.get(useRequestContext().db as object, prop, receiver);
  },
  has(_t, prop) {
    return Reflect.has(useRequestContext().db as object, prop);
  },
});
