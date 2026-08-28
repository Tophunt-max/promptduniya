'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/utils';
import { MonitorIcon, MoonIcon, SunIcon } from '../ui/icon';

/**
 * Theme handling: light / dark / system, persisted to localStorage.
 *
 * The initial class is applied by a blocking inline script in the root layout
 * (see `ThemeScript`) so there is no flash of the wrong theme before hydration.
 */

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'pd-theme';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

function applyTheme(preference: ThemePreference) {
  const dark = preference === 'dark' || (preference === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  return dark ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    const initial: ThemePreference =
      stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    setPreferenceState(initial);
    setResolved(applyTheme(initial));
  }, []);

  useEffect(() => {
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(applyTheme('system'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    setResolved(applyTheme(next));
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}

/** Blocking script that sets the theme class before first paint. */
export function ThemeScript() {
  const script = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var d=s==='dark'||((s===null||s==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

const OPTIONS: { value: ThemePreference; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <SunIcon size={15} /> },
  { value: 'dark', label: 'Dark', icon: <MoonIcon size={15} /> },
  { value: 'system', label: 'System', icon: <MonitorIcon size={15} /> },
];

/** Segmented three-way control, used in the footer and dashboard settings. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        'inline-flex gap-0.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-0.5',
        className,
      )}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={preference === option.value}
          onClick={() => setPreference(option.value)}
          title={option.label}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors',
            preference === option.value
              ? 'bg-[var(--surface-raised)] text-brand-600 shadow-sm dark:text-brand-300'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
          )}
        >
          {option.icon}
          <span className="sr-only sm:not-sr-only">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Compact single-button toggle for the header on small screens. */
export function ThemeToggleButton({ className }: { className?: string }) {
  const { resolved, setPreference } = useTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={cn(
        'grid size-10 place-items-center rounded-full text-body transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]',
        className,
      )}
    >
      {resolved === 'dark' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
    </button>
  );
}
