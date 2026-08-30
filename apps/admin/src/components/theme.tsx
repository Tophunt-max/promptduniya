import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { MoonIcon, SunIcon } from './icons';
import { cn } from './ui';

/**
 * Light/dark theme for the console.
 *
 * Operators work in this tool for long stretches, often late; a dark option is
 * not decoration. The mode is applied as a class on `<html>` and everything else
 * follows from the semantic CSS variables in styles.css, so no component needs a
 * `dark:` variant.
 *
 * Applied before React mounts (see the inline script in index.html) so there is
 * no flash of the wrong theme on load.
 */

type Mode = 'light' | 'dark';

const STORAGE_KEY = 'pd-admin-theme';

function systemMode(): Mode {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readMode(): Mode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* private mode — fall through to the system preference */
  }
  return systemMode();
}

function apply(mode: Mode) {
  document.documentElement.classList.toggle('dark', mode === 'dark');
}

const ThemeContext = createContext<{ mode: Mode; toggle(): void }>({
  mode: 'light',
  toggle() {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => readMode());

  useEffect(() => {
    apply(mode);
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* nothing to do — the theme simply will not persist */
    }
  }, [mode]);

  const toggle = useCallback(() => setMode((current) => (current === 'dark' ? 'light' : 'dark')), []);

  return <ThemeContext.Provider value={{ mode, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, toggle } = useTheme();
  const next = mode === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
      className={cn(
        'grid size-9 place-items-center rounded-lg text-[var(--text-muted)] transition-colors',
        'hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]',
        className,
      )}
    >
      {mode === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
    </button>
  );
}
