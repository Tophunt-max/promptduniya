import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL ?? 'file:./data/promptduniya.db';
const authToken = process.env.DATABASE_AUTH_TOKEN;

/**
 * Local development uses a plain SQLite file; production points at a libSQL
 * server (Turso), which drizzle-kit addresses with the `turso` dialect.
 */
const isRemote = url.startsWith('libsql') || url.startsWith('http');

export default defineConfig(
  isRemote
    ? {
        schema: './src/db/schema.ts',
        out: './src/db/migrations',
        dialect: 'turso',
        dbCredentials: { url, ...(authToken ? { authToken } : {}) },
        verbose: true,
        strict: true,
      }
    : {
        schema: './src/db/schema.ts',
        out: './src/db/migrations',
        dialect: 'sqlite',
        dbCredentials: { url },
        verbose: true,
        strict: true,
      },
);
