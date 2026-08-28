import { defineConfig } from 'drizzle-kit';

/**
 * Migration generation for Cloudflare D1.
 *
 * D1 is SQLite, so the schema and generated SQL are identical to the libSQL
 * version. Migrations are applied with `wrangler d1 migrations apply` (see the
 * api app), not with a runtime migrator — D1 has no connection string.
 */
export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  driver: 'durable-sqlite',
  verbose: true,
  strict: true,
});
