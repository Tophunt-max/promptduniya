import type { ReactNode, TextareaHTMLAttributes } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react';

/** Small presentational kit shared by every admin screen. */

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* --------------------------------- Button --------------------------------- */

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-[0_6px_16px_-8px_rgb(91_61_245/0.7)] hover:bg-brand-700 disabled:bg-brand-300 disabled:shadow-none',
  outline:
    'border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-strong)] hover:border-brand-400 hover:text-brand-600',
  ghost: 'text-[var(--text-body)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]',
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
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-[background-color,color,box-shadow,transform] duration-150',
        'active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-70',
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

/** See the `.field` recipe in styles.css — it carries the focus ring too. */
const FIELD_CLASS = 'field';

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
      <span className="mb-1.5 block text-sm font-semibold text-[var(--text-strong)]">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs font-medium text-rose-600">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-[var(--text-muted)]">{hint}</span>
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
    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--text-strong)]">
      <input
        {...rest}
        type="checkbox"
        className="size-4 rounded border-[var(--border-strong)] text-brand-600 accent-brand-600"
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
      className={cn('card', className)}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-line)] px-4 py-3.5">
          <div>
            {title && <h2 className="text-sm font-bold text-[var(--text-strong)]">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>
            )}
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
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[1.375rem] font-bold text-[var(--text-strong)]">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-[var(--text-body)]">{description}</p>
        )}
      </div>
      {actions}
    </header>
  );
}

/* --------------------------------- Badges --------------------------------- */

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand';

const TONES: Record<Tone, string> = {
  neutral: 'bg-[var(--surface-sunken)] text-[var(--text-body)]',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  danger: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-200',
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
          <tr className="border-b border-[var(--border-line)] text-left">
            {head.map((cell, index) => (
              <th
                key={index}
                className="px-3 py-2.5 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]"
              >
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
  return (
    <tr className="border-b border-[var(--border-line)] transition-colors last:border-0 hover:bg-[var(--surface-hover)]">
      {children}
    </tr>
  );
}

export function Cell({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <td className={cn('px-3 py-3 align-middle text-[var(--text-body)]', className)}>{children}</td>
  );
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
    <p role="status" className="py-12 text-center text-sm text-[var(--text-muted)]">
      {label}…
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-12 text-center text-sm text-[var(--text-muted)]">{children}</p>;
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/55 p-4 py-10 backdrop-blur-sm animate-[admin-fade-in_0.16s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          'card w-full shadow-[var(--shadow-pop)]',
          wide ? 'max-w-3xl' : 'max-w-lg',
        )}
      >
        <header className="flex items-center justify-between border-b border-[var(--border-line)] px-4 py-3.5">
          <h2 className="text-sm font-bold text-[var(--text-strong)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-lg text-lg leading-none text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]"
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
