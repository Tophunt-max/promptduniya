import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Table primitives for the admin panel.
 *
 * Real semantic table markup (scope, caption) so screen readers announce
 * headers correctly, wrapped in a horizontal scroller for narrow viewports.
 */

export interface Column<Row> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  /** Hides the column below the `lg` breakpoint. */
  hideOnMobile?: boolean;
  render: (row: Row) => ReactNode;
}

export function AdminTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  footer,
}: {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  empty?: ReactNode;
  footer?: ReactNode;
}) {
  if (rows.length === 0 && empty) {
    return <div className="card p-8 text-center">{empty}</div>;
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'px-4 py-3 font-bold whitespace-nowrap',
                    column.align === 'right' && 'text-right',
                    column.align === 'center' && 'text-center',
                    column.align !== 'right' && column.align !== 'center' && 'text-left',
                    column.hideOnMobile && 'hidden lg:table-cell',
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-[var(--border-subtle)] transition-colors last:border-0 hover:bg-[var(--surface-sunken)]/60"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-4 py-3 align-middle',
                      column.align === 'right' && 'text-right',
                      column.align === 'center' && 'text-center',
                      column.hideOnMobile && 'hidden lg:table-cell',
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer && <div className="border-t border-[var(--border-subtle)] p-3.5">{footer}</div>}
    </div>
  );
}

export function AdminToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">{children}</div>
  );
}

export function AdminEmpty({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <p className="text-base font-bold">{title}</p>
      {description && <p className="mx-auto mt-1.5 max-w-md text-sm text-body">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** Cell helper: a stacked primary/secondary pair. */
export function CellStack({
  primary,
  secondary,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="truncate font-semibold">{primary}</div>
      {secondary && <div className="truncate text-xs text-faint">{secondary}</div>}
    </div>
  );
}
