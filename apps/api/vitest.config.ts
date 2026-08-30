import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

/**
 * Runs the API inside Miniflare with real local D1, KV and R2 — so tests
 * exercise the actual Worker runtime and bindings, not mocks.
 *
 * Shape note: `@cloudflare/vitest-pool-workers` v0.22 (the Vitest 4 release)
 * removed the `/config` subpath and the `defineWorkersConfig` wrapper. Worker
 * options are now a Vite plugin — `cloudflareTest()` from the package root —
 * composed into a plain `defineConfig`, rather than a `test.poolOptions.workers`
 * block. The package ships a codemod (`dist/codemods/vitest-v3-to-v4.mjs`) that
 * performs exactly this move; this file is the result of applying it.
 *
 * Without the change the suite does not run at all: the old import fails to
 * resolve at config-load time with `Missing "./config" specifier`, which is a
 * startup error rather than a test failure and so reports "no tests" instead of
 * anything red.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // Off deliberately. v0.22 defaults this on, which makes the pool open a
      // remote proxy session against the Cloudflare API before running anything
      // — so the suite needs account credentials and network access to start,
      // and fails with an opaque `/workers/subdomain/edge-preview` error in CI
      // or on a machine that has never run `wrangler login`. Every binding these
      // tests touch (D1, KV, R2) is simulated locally by Miniflare, which is the
      // entire point of running them here.
      remoteBindings: false,
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
    }),
  ],
  test: {
    // `test/port-pending/` holds the pre-split suite, kept in the tree as a
    // porting reference (see the README in there). It does not compile against
    // the current service layer, so collecting it turns every run red for
    // reasons unrelated to the code under test.
    exclude: ['**/node_modules/**', '**/dist/**', 'test/port-pending/**'],
  },
});
