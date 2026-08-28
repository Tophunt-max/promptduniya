import type { MetadataRoute } from 'next';

import { publicEnv } from '@/lib/env-public';

/**
 * PWA manifest.
 *
 * Installable shell with maskable icons and shortcuts to the two creation tools.
 * The service worker (see public/sw.js) caches only the static shell — never
 * account, prompt-body or payment responses.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${publicEnv.siteName} — ${publicEnv.tagline}`,
    short_name: publicEnv.siteName,
    description:
      'Discover trending AI image prompts, generate your own, and turn ideas into stunning visuals.',
    id: '/',
    start_url: '/?utm_source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#faf9ff',
    theme_color: '#5b3df5',
    lang: 'en-IN',
    dir: 'ltr',
    categories: ['productivity', 'graphics', 'utilities'],
    // A single scalable SVG covers every size. It is declared as both `any` and
    // `maskable` because the mark sits inside a full-bleed rounded square, so it
    // survives Android's adaptive-icon crop without a separate asset.
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
    shortcuts: [
      {
        name: 'Prompt generator',
        short_name: 'Generate',
        description: 'Build a prompt from a structured brief',
        url: '/generator',
      },
      {
        name: 'Random prompt',
        short_name: 'Random',
        description: 'Roll a complete random prompt',
        url: '/random-prompt',
      },
      {
        name: 'Saved prompts',
        short_name: 'Saved',
        description: 'Your favourites',
        url: '/favorites',
      },
    ],
  };
}
