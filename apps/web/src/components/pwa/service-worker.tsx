'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker in production only.
 *
 * Skipped in development so a stale cache never masks code changes.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const timer = setTimeout(() => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('[pwa] service worker registration failed:', error);
      });
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  return null;
}
