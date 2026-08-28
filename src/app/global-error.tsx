'use client';

import { useEffect } from 'react';

/**
 * Root error boundary.
 *
 * Replaces the whole document, so it must render its own <html>/<body> and
 * cannot rely on the app's CSS being loaded. Styles are therefore inline.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app] fatal error:', error);
  }, [error]);

  return (
    <html lang="en-IN">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#0b0917',
          color: '#f4f2ff',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: '30rem' }}>
          <p
            style={{
              margin: '0 0 24px',
              fontSize: '18px',
              fontWeight: 800,
              letterSpacing: '-0.02em',
            }}
          >
            promptduniya
          </p>
          <h1 style={{ margin: '0 0 12px', fontSize: '24px', fontWeight: 800 }}>
            The application could not start
          </h1>
          <p style={{ margin: '0 0 24px', lineHeight: 1.6, color: '#b6afcd', fontSize: '14px' }}>
            A fatal error occurred before the page could render. Please reload — if this persists,
            the service may be temporarily unavailable.
          </p>
          {error.digest && (
            <p style={{ margin: '0 0 24px', fontSize: '12px', color: '#8d86a4' }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#5b3df5',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload the page
          </button>
        </div>
      </body>
    </html>
  );
}
