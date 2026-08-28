/*
 * promptduniya service worker.
 *
 * Deliberately conservative. It caches only the static app shell and the offline
 * fallback page. It never caches:
 *   - anything under /api/ (prompt bodies, account data, payments)
 *   - /admin, /dashboard, /favorites, /profile (private surfaces)
 *   - any non-GET request
 *
 * Caching a prompt body would defeat the server-side premium check, and caching
 * account responses would leak data between users on a shared device.
 */

const VERSION = 'pd-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL_URLS = ['/offline', '/icon.svg', '/manifest.webmanifest'];

const PRIVATE_PREFIXES = ['/api/', '/admin', '/dashboard', '/favorites', '/profile', '/login', '/register'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isPrivate(pathname) {
  return PRIVATE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isPrivate(url.pathname)) return;

  // Immutable build assets: cache-first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Navigations: network-first, falling back to the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/offline').then((cached) => cached ?? new Response('Offline', { status: 503 })),
      ),
    );
  }
});
