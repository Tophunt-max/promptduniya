import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted so the console's own CSP (`font-src 'self' data:`) allows it.
// The variable file covers every weight the UI uses in one request.
import '@fontsource-variable/inter';

import { App } from './App';
import { ErrorBoundary } from './components/error-boundary';
import { ThemeProvider } from './components/theme';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      {/* Last-resort boundary. The per-route one inside AdminLayout handles page
          failures; this one catches anything thrown above the router — the login
          screen included — so a crash never leaves an empty document. */}
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);
