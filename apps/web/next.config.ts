import { join } from 'node:path';

import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import type { NextConfig } from 'next';

/**
 * Content Security Policy.
 *
 * Razorpay checkout is loaded from checkout.razorpay.com and needs to open
 * frames/popups to api.razorpay.com. Everything else stays locked down.
 * `unsafe-inline` for styles is required by Next.js' inlined critical CSS.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com",
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // Monorepo: trace from the repository root so workspace packages resolve.
  outputFileTracingRoot: join(import.meta.dirname, '../..'),
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: 'media.promptduniya.in' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  experimental: {
    optimizePackageImports: ['zod'],
  },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      {
        source: '/api/(.*)',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

/**
 * Refuses to produce a production build that calls itself localhost.
 *
 * `NEXT_PUBLIC_SITE_URL` is inlined at build time and falls back to
 * `http://localhost:3000`. That fallback is right for `next dev` and damaging in
 * a deploy, because it is the value behind every canonical link, every Open Graph
 * URL and every entry in `sitemap.xml` — so the site builds and serves normally
 * while telling search engines its content lives on the developer's own machine.
 * Nothing on the page looks wrong, which is what makes it survive a review.
 *
 * `.env.production` is deliberately untracked, so a fresh clone has no copy and a
 * build from that clone is silently wrong. It has happened: the deployed site was
 * serving `<link rel="canonical" href="http://localhost:3000"/>` and a sitemap of
 * localhost URLs. The missing file was not the defect — the build accepting its
 * absence was.
 */
function assertDeployableSiteUrl(): void {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!value) {
    throw new Error(
      'NEXT_PUBLIC_SITE_URL is not set, so this production build would fall back to ' +
        'http://localhost:3000 in every canonical link, Open Graph tag and sitemap entry.\n' +
        'Create apps/web/.env.production with, for example:\n' +
        '  NEXT_PUBLIC_SITE_URL=https://yourdomain',
    );
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(value)) {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL points at a local address (${value}), which would be published ` +
        'as this site\'s canonical URL and in its sitemap.\n' +
        'Set apps/web/.env.production to the live origin before building.',
    );
  }
}

/**
 * Gives `next dev` access to the local Cloudflare bindings declared in
 * `wrangler.jsonc` — notably the `API` service binding — so local development
 * exercises the same transport as production.
 */
void initOpenNextCloudflareForDev();

/**
 * Exported as a function so the guard runs for `next build` only. `next dev` and
 * `next start` load this same file, and neither should be blocked by the absence
 * of a production value.
 */
export default function config(phase: string): NextConfig {
  if (phase === 'phase-production-build') assertDeployableSiteUrl();
  return nextConfig;
}
