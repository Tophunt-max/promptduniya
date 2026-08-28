'use client';

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';
import { AlertIcon, ChevronDownIcon } from './icon';

/**
 * Form primitives.
 *
 * Every control is wired to a real <label> via a generated id, and errors are
 * announced with `aria-describedby` + `role="alert"` so assistive tech picks
 * them up without needing a live region on the page.
 */

const controlBase =
  'w-full rounded-xl border bg-[var(--surface-raised)] px-3.5 text-[var(--text-primary)] ' +
  'placeholder:text-[var(--text-muted)] transition-[border-color,box-shadow] duration-200 ' +
  'focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export function FieldShell({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
  labelSuffix,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
  labelSuffix?: ReactNode;
}) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      {label && (
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={htmlFor} className="text-[0.8125rem] font-semibold">
            {label}
            {required && (
              <span className="ml-0.5 text-rose-500" aria-hidden="true">
                *
              </span>
            )}
          </label>
          {labelSuffix}
        </div>
      )}
      {children}
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
          <AlertIcon size={14} className="mt-px shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leadingIcon?: ReactNode;
  containerClassName?: string;
  labelSuffix?: ReactNode;
}

export function Input({
  label,
  hint,
  error,
  leadingIcon,
  className,
  containerClassName,
  labelSuffix,
  id,
  ...rest
}: InputProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const describedBy = error || hint ? `${inputId}-desc` : undefined;

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={rest.required}
      htmlFor={inputId}
      className={containerClassName}
      labelSuffix={labelSuffix}
    >
      <div className="relative">
        {leadingIcon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            {leadingIcon}
          </span>
        )}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            controlBase,
            'h-11',
            error ? 'border-rose-400' : 'border-[var(--border-subtle)]',
            leadingIcon ? 'pl-10' : undefined,
            className,
          )}
          {...rest}
        />
      </div>
    </FieldShell>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
  labelSuffix?: ReactNode;
}

export function Textarea({
  label,
  hint,
  error,
  className,
  containerClassName,
  labelSuffix,
  id,
  rows = 4,
  ...rest
}: TextareaProps) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={rest.required}
      htmlFor={fieldId}
      className={containerClassName}
      labelSuffix={labelSuffix}
    >
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        className={cn(
          controlBase,
          'resize-y py-2.5 leading-relaxed',
          error ? 'border-rose-400' : 'border-[var(--border-subtle)]',
          className,
        )}
        {...rest}
      />
    </FieldShell>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: readonly SelectOption[];
  placeholder?: string;
  containerClassName?: string;
}

export function Select({
  label,
  hint,
  error,
  options,
  placeholder,
  className,
  containerClassName,
  id,
  ...rest
}: SelectProps) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={rest.required}
      htmlFor={fieldId}
      className={containerClassName}
    >
      <div className="relative">
        <select
          id={fieldId}
          aria-invalid={error ? true : undefined}
          className={cn(
            controlBase,
            'h-11 cursor-pointer appearance-none pr-10',
            error ? 'border-rose-400' : 'border-[var(--border-subtle)]',
            className,
          )}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          size={18}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
      </div>
    </FieldShell>
  );
}

export function Checkbox({
  label,
  description,
  error,
  id,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  description?: string;
  error?: string;
}) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <div className="grid gap-1">
      <label htmlFor={fieldId} className="flex cursor-pointer items-start gap-2.5">
        <input
          id={fieldId}
          type="checkbox"
          className={cn(
            'mt-0.5 size-[1.15rem] shrink-0 cursor-pointer rounded-[0.4rem] border-2 border-[var(--border-strong)]',
            'accent-brand-600 transition-colors checked:border-brand-600',
            className,
          )}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
        <span className="text-sm leading-snug">
          {label}
          {description && <span className="mt-0.5 block text-xs text-faint">{description}</span>}
        </span>
      </label>
      {error && (
        <p role="alert" className="ml-7 text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}

/** Accessible switch built on a real checkbox so forms and keyboards just work. */
export function Switch({
  label,
  description,
  checked,
  onChange,
  name,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  name?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-start justify-between gap-4 rounded-xl border border-[var(--border-subtle)] p-3.5',
        disabled ? 'opacity-60' : 'cursor-pointer hover:border-[var(--border-strong)]',
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-faint">{description}</span>}
      </span>
      <span className="relative mt-0.5 shrink-0">
        <input
          id={id}
          name={name}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            'block h-6 w-11 rounded-full transition-colors duration-200',
            checked ? 'bg-brand-600' : 'bg-ink-300 dark:bg-ink-700',
            'peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/25',
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </label>
  );
}

/** Chip-style single-select, used across the filter drawer and generator. */
export function ChipGroup({
  label,
  options,
  value,
  onChange,
  allowClear = true,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  allowClear?: boolean;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-[0.8125rem] font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {allowClear && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-pressed={!value}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              !value
                ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-950'
                : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            Any
          </button>
        )}
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(active ? undefined : option.value)}
              aria-pressed={active}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                active
                  ? 'bg-brand-600 text-white'
                  : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
