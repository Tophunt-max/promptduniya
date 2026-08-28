'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';
import { BookmarkIcon, CompassIcon, HomeIcon, SparkleIcon, UserIcon } from '../ui/icon';
import { useViewer } from '../viewer-provider';

/**
 * Sticky bottom navigation for touch devices.
 *
 * Five destinations, 56px+ tap targets, and safe-area padding for iPhone home
 * indicators. Hidden on the admin panel, which has its own shell.
 */

const ITEMS = [
  { href: '/', label: 'Home', icon: HomeIcon, match: (p: string) => p === '/' },
  {
    href: '/explore',
    label: 'Explore',
    icon: CompassIcon,
    match: (p: string) => p.startsWith('/explore') || p.startsWith('/category') || p.startsWith('/search'),
  },
  {
    href: '/generator',
    label: 'Create',
    icon: SparkleIcon,
    match: (p: string) => p.startsWith('/generator') || p.startsWith('/random-prompt'),
    highlight: true,
  },
  { href: '/favorites', label: 'Saved', icon: BookmarkIcon, match: (p: string) => p.startsWith('/favorites') },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  const viewer = useViewer();

  if (pathname.startsWith('/admin')) return null;

  const profileHref = viewer.isAuthenticated ? '/dashboard' : '/login';
  const profileActive = pathname.startsWith('/dashboard') || pathname.startsWith('/profile');

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--surface-raised)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.625rem] font-semibold transition-colors',
                  active ? 'text-brand-600 dark:text-brand-300' : 'text-[var(--text-muted)]',
                )}
              >
                <span
                  className={cn(
                    'grid size-8 place-items-center rounded-xl transition-colors',
                    'highlight' in item && item.highlight && !active && 'gradient-brand text-white',
                    active && 'bg-brand-50 dark:bg-brand-950/70',
                  )}
                >
                  <Icon size={19} />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}

        <li>
          <Link
            href={profileHref}
            aria-current={profileActive ? 'page' : undefined}
            className={cn(
              'flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.625rem] font-semibold transition-colors',
              profileActive ? 'text-brand-600 dark:text-brand-300' : 'text-[var(--text-muted)]',
            )}
          >
            <span
              className={cn(
                'grid size-8 place-items-center rounded-xl transition-colors',
                profileActive && 'bg-brand-50 dark:bg-brand-950/70',
              )}
            >
              <UserIcon size={19} />
            </span>
            Profile
          </Link>
        </li>
      </ul>
    </nav>
  );
}

/** Spacer so page content is never hidden behind the fixed bottom bar. */
export function MobileNavSpacer() {
  return <div aria-hidden="true" className="h-16 lg:hidden" />;
}
