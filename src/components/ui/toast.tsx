'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './icon';

/**
 * Toast notifications.
 *
 * Rendered into a polite live region so screen readers announce them without
 * stealing focus. Auto-dismiss is paused for error toasts, which usually carry
 * an action the user needs to read.
 */

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; href: string };
}

interface ToastContextValue {
  toasts: Toast[];
  push(toast: Omit<Toast, 'id'>): void;
  dismiss(id: string): void;
  success(title: string, description?: string): void;
  error(title: string, description?: string, action?: Toast['action']): void;
  info(title: string, description?: string): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { wrapper: string; icon: ReactNode }> = {
  success: {
    wrapper: 'border-emerald-500/35 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/85 dark:text-emerald-50',
    icon: <CheckIcon size={18} className="text-emerald-600 dark:text-emerald-400" />,
  },
  error: {
    wrapper: 'border-rose-500/35 bg-rose-50 text-rose-900 dark:bg-rose-950/85 dark:text-rose-50',
    icon: <AlertIcon size={18} className="text-rose-600 dark:text-rose-400" />,
  },
  info: {
    wrapper: 'border-brand-500/35 bg-brand-50 text-brand-950 dark:bg-brand-950/85 dark:text-brand-50',
    icon: <InfoIcon size={18} className="text-brand-600 dark:text-brand-300" />,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      const ttl = toast.tone === 'error' ? 7000 : 3600;
      setTimeout(() => dismiss(id), ttl);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      success: (title, description) => push({ tone: 'success', title, description }),
      error: (title, description, action) => push({ tone: 'error', title, description, action }),
      info: (title, description) => push({ tone: 'info', title, description }),
    }),
    [toasts, push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[90] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end sm:px-0"
      >
        {toasts.map((toast) => {
          const tone = TONE_STYLES[toast.tone];
          return (
            <div
              key={toast.id}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-[var(--shadow-lift)] animate-[fade-up_0.25s_cubic-bezier(0.16,1,0.3,1)_both] backdrop-blur',
                tone.wrapper,
              )}
            >
              <span className="mt-0.5 shrink-0">{tone.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.description && (
                  <p className="mt-0.5 text-xs opacity-85">{toast.description}</p>
                )}
                {toast.action && (
                  <a
                    href={toast.action.href}
                    className="mt-1.5 inline-block text-xs font-bold underline underline-offset-2"
                  >
                    {toast.action.label}
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded-md p-1 opacity-60 transition-opacity hover:opacity-100"
              >
                <CloseIcon size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
