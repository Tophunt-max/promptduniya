'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { PremiumBadge } from '../ui/badge';
import {
  BellIcon,
  BookmarkIcon,
  ChartIcon,
  CreditCardIcon,
  CrownIcon,
  HeartIcon,
  SettingsIcon,
  SparkleIcon,
  UserIcon,
} from '../ui/icon';
import { UserAvatar } from '../layout/user-avatar';
import { useViewer } from '../viewer-provider';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: ChartIcon, exact: true },
  { href: '/favorites', label: 'Saved prompts', icon: BookmarkIcon },
  { href: '/dashboard/liked', label: 'Liked prompts', icon: HeartIcon },
  { href: '/dashboard/generated', label: 'My prompts', icon: SparkleIcon },
  { href: '/dashboard/billing', label: 'Premium & billing', icon: CreditCardIcon },
  { href: '/dashboard/notifications', label: 'Notifications', icon: BellIcon },
  { href: '/profile', label: 'Profile', icon: UserIcon },
  { href: '/dashboard/settings', label: 'Settings', icon: SettingsIcon },
] as const;

/**
 * Dashboard chrome.
 *
 * Sidebar on desktop, a horizontal scrolling rail on mobile — no hamburger
 * inside a hamburger, and the current section is always visible.
 */
export function DashboardShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const viewer = useViewer();

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="container-page py-6 sm:py-9">
      <div className="lg:flex lg:gap-9">
        <aside className="lg:w-60 lg:shrink-0" aria-label="Dashboard sections">
          <div className="card mb-4 flex items-center gap-3 p-4">
            <UserAvatar
              name={viewer.name ?? 'You'}
              avatarUrl={viewer.avatarUrl}
              isPremium={viewer.isPremium}
              size={42}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{viewer.name}</p>
              <div className="mt-1">
                {viewer.isPremium ? (
                  <PremiumBadge />
                ) : (
                  <Link
                    href="/premium"
                    className="inline-flex items-center gap-1 text-[0.6875rem] font-bold text-marigold-700 hover:underline dark:text-marigold-300"
                  >
                    <CrownIcon size={11} />
                    Upgrade
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Mobile: horizontal rail. Desktop: vertical list. */}
          <nav className="snap-rail scrollbar-none -mx-1 px-1 pb-2 lg:mx-0 lg:grid lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href, 'exact' in item ? item.exact : false);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors',
                    'whitespace-nowrap lg:whitespace-normal',
                    active
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-200'
                      : 'text-body hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]',
                  )}
                >
                  <Icon size={17} />
                  {item.label}
                  {item.href === '/dashboard/notifications' && viewer.unreadNotifications > 0 && (
                    <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[0.625rem] font-bold text-white">
                      {viewer.unreadNotifications}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 pt-4 lg:pt-0">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold sm:text-2xl">{title}</h1>
              {description && <p className="mt-1.5 text-sm text-body">{description}</p>}
            </div>
            {actions}
          </header>

          {children}
        </div>
      </div>
    </div>
  );
}

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  href?: string;
}

export function StatCard({ label, value, hint, icon, href }: StatCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-faint">{label}</p>
        {icon && <span className="text-brand-500 dark:text-brand-300">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="card card-hover p-4">
        {content}
      </Link>
    );
  }
  return <div className="card p-4">{content}</div>;
}

/** Progress bar for daily quotas. */
export function UsageMeter({
  label,
  used,
  limit,
  hint,
}: {
  label: string;
  used: number;
  limit: number;
  hint?: string;
}) {
  const unlimited = limit < 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const nearLimit = !unlimited && pct >= 80;

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-sm font-bold tabular-nums">
          {unlimited ? 'Unlimited' : `${used} / ${limit}`}
        </p>
      </div>
      {!unlimited && (
        <div
          className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
          role="progressbar"
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-label={label}
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              nearLimit ? 'bg-marigold-500' : 'bg-brand-600',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {hint && <p className="mt-2 text-xs text-faint">{hint}</p>}
    </div>
  );
}
