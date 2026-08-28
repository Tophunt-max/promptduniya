/**
 * Browser-safe configuration.
 *
 * Split out from `env.ts` so client components can import site metadata without
 * pulling the server-side (secret-reading) module into the client bundle.
 * Values are inlined at build time by Next.js.
 */
export const publicEnv = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  siteName: process.env.NEXT_PUBLIC_SITE_NAME || 'promptduniya',
  tagline: process.env.NEXT_PUBLIC_SITE_TAGLINE || 'Create Better. Imagine More.',
  razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
  analyticsEnabled: process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== 'false',
  adsEnabled: process.env.NEXT_PUBLIC_ADS_ENABLED === 'true',
} as const;
