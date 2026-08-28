import type { ReactNode, TextareaHTMLAttributes } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react';

/** Small presentational kit shared by every admin screen. */

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* --------------------------------- Button --------------------------------- */

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300',
  outline: 'border border-line bg-white text-ink hover:bg-canvas',
  ghost: 'text-body hover:bg-canvas',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
}) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:cursor-not-allowed',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-sm',
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {loading ? 'Working…' : children}
    </button>
  );
}

/* --------------------------------- Fields --------------------------------- */

const FIELD_CLASS =
  'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none';

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-medium text-rose-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(FIELD_CLASS, className)} />;
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cn(FIELD_CLASS, 'min-h-24 resize-y', className)} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={cn(FIELD_CLASS, className)} />;
}

export function Checkbox({
  label,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-ink">
      <input
        {...rest}
        type="checkbox"
        className="size-4 rounded border-line text-brand-600 focus:ring-brand-500"
      />
      {label}
    </label>
  );
}

/* --------------------------------- Layout --------------------------------- */

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn('rounded-xl border border-line bg-surface shadow-sm', className)}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-bold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-body">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

/* --------------------------------- Badges --------------------------------- */

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand';

const TONES: Record<Tone, string> = {
  neutral: 'bg-canvas text-body',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-rose-50 text-rose-700',
  brand: 'bg-brand-50 text-brand-700',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------------- Tables --------------------------------- */

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-160 border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            {head.map((cell, index) => (
              <th key={index} className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <tr className="border-b border-line/70 last:border-0 hover:bg-canvas/60">{children}</tr>;
}

export function Cell({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('px-3 py-2.5 align-middle text-body', className)}>{children}</td>;
}

/* -------------------------------- Feedback -------------------------------- */

export function Alert({ tone = 'danger', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('rounded-lg px-3 py-2 text-sm font-medium', TONES[tone])}
    >
      {children}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <p role="status" className="py-10 text-center text-sm text-muted">
      {label}…
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted">{children}</p>;
}

/* --------------------------------- Modal ---------------------------------- */

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose(): void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 py-10"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          'w-full rounded-xl border border-line bg-surface shadow-xl',
          wide ? 'max-w-3xl' : 'max-w-lg',
        )}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-bold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded px-2 text-lg leading-none text-muted hover:text-ink"
          >
            ×
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------- Formatting ------------------------------- */

export function formatDateTime(seconds: number | null | undefined): string {
  if (!seconds) return '—';
  return new Date(seconds * 1000).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatDate(seconds: number | null | undefined): string {
  if (!seconds) return '—';
  return new Date(seconds * 1000).toLocaleDateString('en-IN', { dateStyle: 'medium' });
}

export function formatMoney(amountMinor: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
  }).format(amountMinor / 100);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}
