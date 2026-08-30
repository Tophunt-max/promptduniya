import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted so the console's own CSP (`font-src 'self' data:`) allows it.
// The variable file covers every weight the UI uses in one request.
import '@fontsource-variable/inter';

import { App } from './App';
import { ThemeProvider } from './components/theme';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
