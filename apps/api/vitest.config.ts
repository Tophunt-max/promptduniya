import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

/**
 * Runs the API inside Miniflare with real local D1, KV and R2 — so tests
 * exercise the actual Worker runtime and bindings, not mocks.
 */
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          compatibilityFlags: ['nodejs_compat'],
          compatibilityDate: '2024-11-01',
          bindings: {
            AUTH_SECRET: 'test-secret-value-that-is-long-enough-0123456789',
            AUTH_BCRYPT_ROUNDS: '4',
            ENVIRONMENT: 'test',
            WEB_ORIGIN: 'http://localhost:3000',
            ADMIN_ORIGIN: 'http://localhost:5173',
            PAYMENTS_MOCK_MODE: 'true',
          },
        },
      },
    },
  },
});
