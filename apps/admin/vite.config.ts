import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/**
 * Refuses to produce a production bundle that points at localhost.
 *
 * `VITE_API_BASE_URL` is inlined at build time and falls back to
 * `http://127.0.0.1:8787` for local development. That fallback is correct for
 * `npm run dev` and catastrophic for a deploy: the bundle builds, uploads and
 * serves perfectly, then every request from the browser goes to the operator's
 * own machine and the console shows nothing but "Could not reach the API".
 *
 * It is an easy state to reach, because `.env.production` is deliberately
 * untracked — so a fresh clone has no copy of it, and building from that clone
 * produces a broken console with no warning at any step. That has now happened
 * twice in production.
 *
 * The missing file was never really the defect; the build accepting its absence
 * was. Failing here turns a silent outage into a build error that says what to
 * write and where.
 */
function assertDeployableApiUrl(mode: string, root: string): void {
  if (mode !== 'production') return;

  const value = loadEnv(mode, root, 'VITE_').VITE_API_BASE_URL?.trim();

  if (!value) {
    throw new Error(
      'VITE_API_BASE_URL is not set, so this production build would fall back to ' +
        'http://127.0.0.1:8787 and the deployed console could not reach the API.\n' +
        'Create apps/admin/.env.production with, for example:\n' +
        '  VITE_API_BASE_URL=https://api.yourdomain\n' +
        'It must match the API worker\'s ADMIN_ORIGIN and the connect-src in public/_headers.',
    );
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(value)) {
    throw new Error(
      `VITE_API_BASE_URL points at a local address (${value}), which no browser but yours can reach.\n` +
        'Set apps/admin/.env.production to the deployed API origin before building.',
    );
  }
}

export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL('.', import.meta.url));
  assertDeployableApiUrl(mode, root);

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
    },
    build: {
      outDir: 'dist',
      // No source maps in the deployed bundle: it keeps the upload small and
      // avoids publishing readable source for an internal console.
      sourcemap: false,
      // The admin bundle is behind a login and only used by a handful of people,
      // so a slightly larger single chunk is preferable to aggressive splitting.
      chunkSizeWarningLimit: 900,
    },
  };
});
