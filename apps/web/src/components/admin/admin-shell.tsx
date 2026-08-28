'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Logo } from '../brand/logo';
import { ThemeToggleButton } from '../theme/theme-provider';
import { Badge } from '../ui/badge';
import {
  ChartIcon,
  ChevronLeftIcon,
  CloseIcon,
  CreditCardIcon,
  CrownIcon,
  FileTextIcon,
  GridIcon,
  ImageIcon,
  MailIcon,
  MenuIcon,
  SettingsIcon,
  ShieldIcon,
  SparkleIcon,
  TagIcon,
  UsersIcon,
} from '../ui/icon';
import { UserAvatar } from '../layout/user-avatar';
import { useViewer } from '../viewer-provider';

const SECTIONS: {
  title: string;
  items: { href: string; label: string; icon: typeof ChartIcon; adminOnly?: boolean }[];
}[] = [
  {
    title: 'Overview',
    items: [
      { href: '/admin', label: 'Dashboard', icon: ChartIcon },
      { href: '/admin/analytics', label: 'Analytics', icon: ChartIcon },
    ],
  },
  {
    title: 'Content',
    items: [
      { href: '/admin/prompts', label: 'Prompts', icon: SparkleIcon },
      { href: '/admin/categories', label: 'Categories', icon: GridIcon },
      { href: '/admin/tags', label: 'Tags', icon: TagIcon },
      { href: '/admin/articles', label: 'Articles', icon: FileTextIcon },
      { href: '/admin/media', label: 'Media', icon: ImageIcon },
    ],
  },
  {
    title: 'People',
    items: [
      { href: '/admin/users', label: 'Users', icon: UsersIcon },
      { href: '/admin/moderation', label: 'Moderation', icon: ShieldIcon },
      { href: '/admin/messages', label: 'Messages', icon: MailIcon },
    ],
  },
  {
    title: 'Revenue',
    items: [
      { href: '/admin/plans', label: 'Plans', icon: CrownIcon, adminOnly: true },
      { href: '/admin/subscriptions', label: 'Subscriptions', icon: CrownIcon, adminOnly: true },
      { href: '/admin/payments', label: 'Payments', icon: CreditCardIcon, adminOnly: true },
      { href: '/admin/coupons', label: 'Coupons', icon: TagIcon, adminOnly: true },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/admin/settings', label: 'Settings', icon: SettingsIcon, adminOnly: true },
      { href: '/admin/logs', label: 'Audit log', icon: ShieldIcon, adminOnly: true },
    ],
  },
];

/**
 * Admin chrome.
 *
 * Navigation is filtered by role for usability, but that is cosmetic only —
 * every admin route and API handler re-checks authorisation on the server.
 */
export function AdminShell({
  title,
  description,
  actions,
  children,
  pendingCount,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  pendingCount?: number;
}) {
  const pathname = usePathname();
  const viewer = useViewer();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const nav = (
    <nav aria-label="Admin sections" className="grid gap-5">
      {SECTIONS.map((section) => {
        const items = section.items.filter((item) => !item.adminOnly || viewer.isAdmin);
        if (items.length === 0) return null;

        return (
          <div key={section.title}>
            <p className="mb-1.5 px-3 text-[0.625rem] font-bold uppercase tracking-[0.14em] text-faint">
              {section.title}
            </p>
            <div className="grid gap-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                      active
                        ? 'bg-brand-600 text-white'
                        : 'text-body hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    <Icon size={16} />
                    {item.label}
                    {item.href === '/admin/moderation' && (pendingCount ?? 0) > 0 && (
                      <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[0.625rem] font-bold text-white">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-[var(--surface-page)]">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)]/92 backdrop-blur-xl">
        <div className="flex h-15 items-center gap-3 px-4 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open admin menu"
            className="grid size-10 place-items-center rounded-full text-body hover:bg-[var(--surface-sunken)] lg:hidden"
          >
            <MenuIcon size={20} />
          </button>

          <Logo size={30} showWordmark={false} />
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold">Admin</p>
            <p className="truncate text-[0.6875rem] text-faint">promptduniya control panel</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-body transition-colors hover:text-brand-600 sm:flex"
            >
              <ChevronLeftIcon size={14} />
              View site
            </Link>
            <Badge tone={viewer.isAdmin ? 'brand' : 'neutral'}>
              {viewer.isAdmin ? 'Administrator' : 'Editor'}
            </Badge>
            <ThemeToggleButton />
            <UserAvatar name={viewer.name ?? 'Admin'} avatarUrl={viewer.avatarUrl} size={32} />
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="hidden w-60 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 lg:block">
          <div className="sticky top-20">{nav}</div>
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close admin menu"
              onClick={() => setMobileOpen(false)}
              className="absolute inset-0 cursor-default bg-ink-950/55 backdrop-blur-sm"
            />
            <div className="absolute inset-y-0 left-0 w-[min(17rem,84vw)] overflow-y-auto border-r border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-extrabold">Admin</p>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close menu"
                  className="grid size-9 place-items-center rounded-full hover:bg-[var(--surface-sunken)]"
                >
                  <CloseIcon size={18} />
                </button>
              </div>
              {nav}
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold sm:text-2xl">{title}</h1>
              {description && <p className="mt-1.5 text-sm text-body">{description}</p>}
            </div>
            {actions}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
