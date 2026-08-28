import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'premium'
  | 'subtle';

export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const base =
  'relative inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap ' +
  'rounded-xl transition-[background-color,color,box-shadow,transform] duration-200 ' +
  'disabled:pointer-events-none disabled:opacity-55 active:scale-[0.985] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2';

const variants: Record<ButtonVariant, string> = {
  primary:
    'gradient-brand text-white shadow-[0_10px_24px_-12px_rgb(91_61_245/0.7)] hover:brightness-[1.06] hover:shadow-[0_14px_30px_-12px_rgb(91_61_245/0.8)]',
  secondary:
    'bg-ink-900 text-white hover:bg-ink-800 dark:bg-white dark:text-ink-950 dark:hover:bg-ink-100',
  outline:
    'border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-brand-500 hover:text-brand-600 dark:hover:text-brand-300',
  ghost:
    'text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]',
  subtle:
    'bg-[var(--surface-sunken)] text-[var(--text-primary)] hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-950/60 dark:hover:text-brand-200',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  premium:
    'bg-gradient-to-r from-marigold-500 to-marigold-600 text-white shadow-[0_10px_24px_-12px_rgb(242_106_18/0.7)] hover:brightness-[1.05]',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-[0.8125rem]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-13 px-7 text-base',
  icon: 'h-10 w-10 p-0',
};

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

function classesFor({ variant = 'primary', size = 'md', fullWidth }: CommonProps, extra?: string) {
  return cn(base, variants[variant], sizes[size], fullWidth && 'w-full', extra);
}

function Spinner() {
  return (
    <svg
      className="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant,
  size,
  fullWidth,
  loading,
  leadingIcon,
  trailingIcon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classesFor({ variant, size, fullWidth }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : leadingIcon}
      {children}
      {!loading && trailingIcon}
    </button>
  );
}

export type ButtonLinkProps = CommonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function ButtonLink({
  variant,
  size,
  fullWidth,
  leadingIcon,
  trailingIcon,
  className,
  children,
  href,
  ...rest
}: ButtonLinkProps) {
  const isExternal = /^https?:\/\//.test(href) || href.startsWith('mailto:');
  const classes = classesFor({ variant, size, fullWidth }, className);

  if (isExternal) {
    return (
      <a href={href} className={classes} rel="noopener noreferrer" {...rest}>
        {leadingIcon}
        {children}
        {trailingIcon}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...rest}>
      {leadingIcon}
      {children}
      {trailingIcon}
    </Link>
  );
}

/** Small square icon-only action, used in card corners and toolbars. */
export function IconButton({
  label,
  className,
  variant = 'ghost',
  ...rest
}: Omit<ButtonProps, 'children' | 'size'> & { label: string; children?: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        base,
        variants[variant],
        'size-10 rounded-full p-0',
        className,
      )}
      {...rest}
    />
  );
}
