import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';

import { ThemeProvider, ThemeScript } from '@/components/theme/theme-provider';
import { ToastProvider } from '@/components/ui/toast';
import { ViewerProvider } from '@/components/viewer-provider';
import { publicEnv } from '@/lib/env-public';
import { DEFAULT_DESCRIPTION, absoluteUrl } from '@/lib/seo';
import { getViewerSnapshot } from '@/lib/viewer';

import './globals.css';

/**
 * Fonts are self-hosted by next/font at build time — no runtime request to
 * Google, no layout shift, and no dependency on the visitor happening to have
 * the face installed locally. Both are variable fonts, so the whole weight
 * range costs one file each.
 *
 * Two faces, with a clear division of labour: Plus Jakarta Sans has the tighter
 * apertures and higher contrast that headlines want, Inter has the larger
 * x-height that keeps long prompt text readable at 14px on a phone.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: {
    default: `${publicEnv.siteName} — ${publicEnv.tagline}`,
    template: `%s · ${publicEnv.siteName}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: publicEnv.siteName,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: publicEnv.siteName,
    statusBarStyle: 'default',
  },
  // `icon.svg` and `apple-icon.tsx` live in src/app, so Next.js wires the
  // <link> tags automatically; this only pins the SVG as the preferred icon.
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
  openGraph: {
    type: 'website',
    siteName: publicEnv.siteName,
    locale: 'en_IN',
    url: absoluteUrl('/'),
  },
  twitter: { card: 'summary_large_image' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9ff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0917' },
  ],
  colorScheme: 'light dark',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewerSnapshot();

  return (
    <html
      lang="en-IN"
      suppressHydrationWarning
      className={`${inter.variable} ${jakarta.variable}`}
    >
      <head>
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider>
          <ViewerProvider viewer={viewer}>
            <ToastProvider>{children}</ToastProvider>
          </ViewerProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
