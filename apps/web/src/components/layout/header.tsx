'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { api } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import { Logo } from '../brand/logo';
import { SearchBar } from '../search/search-bar';
import { ThemeToggleButton } from '../theme/theme-provider';
import { Badge, PremiumBadge } from '../ui/badge';
import { ButtonLink } from '../ui/button';
import {
  BellIcon,
  BookmarkIcon,
  ChartIcon,
  CloseIcon,
  CrownIcon,
  GridIcon,
  LogOutIcon,
  MenuIcon,
  SearchIcon,
  SettingsIcon,
  SparkleIcon,
  UserIcon,
} from '../ui/icon';
import { useToast } from '../ui/toast';
import { useViewer } from '../viewer-provider';
import { UserAvatar } from './user-avatar';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/explore', label: 'Explore' },
  { href: '/categories', label: 'Categories' },
  { href: '/generator', label: 'Generator' },
  { href: '/premium', label: 'Premium' },
  { href: '/about', label: 'About' },
] as const;

export function Header({ popularSearches = [] }: { popularSearches?: string[] }) {
  const viewer = useViewer();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();

  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Route changes should always close every transient panel.
  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  async function signOut() {
    try {
      await api.post('/api/auth/logout');
      toast.success('Signed out');
      router.push('/');
      router.refresh();
    } catch {
      toast.error('Could not sign out', 'Please try again.');
    }
  }

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      <a
        href="#main"
        className="sr-only-focusable fixed left-4 top-4 z-[100] rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
      >
        Skip to content
      </a>

      <header
        className={cn(
          'sticky top-0 z-50 border-b transition-[background-color,border-color,box-shadow] duration-200',
          scrolled
            ? 'border-[var(--border-subtle)] bg-[var(--surface-page)]/88 shadow-[var(--shadow-soft)] backdrop-blur-xl'
            : 'border-transparent bg-[var(--surface-page)]',
        )}
      >
        <div className="container-page flex h-16 items-center gap-3">
          <Logo size={32} />

          <nav aria-label="Main" className="ml-4 hidden items-center gap-0.5 lg:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={cn(
                  'relative rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                  isActive(link.href)
                    ? 'text-brand-600 dark:text-brand-300'
                    : 'text-body hover:text-[var(--text-primary)]',
                )}
              >
                {link.label}
                {link.label === 'Premium' && (
                  <span className="ml-1.5 inline-block size-1.5 rounded-full bg-marigold-500 align-middle" />
                )}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            {/* Desktop inline search */}
            <div className="hidden w-64 xl:block">
              <SearchBar popularSearches={popularSearches} placeholder="Search prompts…" />
            </div>

            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Search"
              aria-expanded={searchOpen}
              className="grid size-10 place-items-center rounded-full text-body transition-colors hover:bg-[var(--surface-sunken)] xl:hidden"
            >
              <SearchIcon size={18} />
            </button>

            <ThemeToggleButton className="hidden sm:grid" />

            {viewer.isAuthenticated ? (
              <>
                <Link
                  href="/dashboard/notifications"
                  aria-label={`Notifications${
                    viewer.unreadNotifications > 0 ? ` (${viewer.unreadNotifications} unread)` : ''
                  }`}
                  className="relative hidden size-10 place-items-center rounded-full text-body transition-colors hover:bg-[var(--surface-sunken)] sm:grid"
                >
                  <BellIcon size={18} />
                  {viewer.unreadNotifications > 0 && (
                    <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[0.5625rem] font-bold text-white">
                      {viewer.unreadNotifications > 9 ? '9+' : viewer.unreadNotifications}
                    </span>
                  )}
                </Link>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAccountOpen((v) => !v)}
                    aria-expanded={accountOpen}
                    aria-haspopup="menu"
                    aria-label="Account menu"
                    className="ml-0.5 flex items-center gap-1.5 rounded-full p-0.5 transition-colors hover:bg-[var(--surface-sunken)]"
                  >
                    <UserAvatar
                      name={viewer.name ?? 'You'}
                      avatarUrl={viewer.avatarUrl}
                      isPremium={viewer.isPremium}
                      size={34}
                    />
                  </button>

                  {accountOpen && (
                    <>
                      <button
                        type="button"
                        aria-label="Close menu"
                        onClick={() => setAccountOpen(false)}
                        className="fixed inset-0 z-40 cursor-default"
                      />
                      <div
                        role="menu"
                        className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-lift)] animate-[fade-in_0.14s_ease-out]"
                      >
                        <div className="border-b border-[var(--border-subtle)] px-3 pb-3 pt-2">
                          <p className="truncate text-sm font-bold">{viewer.name}</p>
                          <p className="truncate text-xs text-faint">{viewer.email}</p>
                          <div className="mt-2">
                            {viewer.isPremium ? (
                              <PremiumBadge />
                            ) : (
                              <Badge tone="neutral">{viewer.planName} plan</Badge>
                            )}
                          </div>
                        </div>

                        {[
                          { href: '/dashboard', label: 'Dashboard', icon: <ChartIcon size={16} /> },
                          { href: '/favorites', label: 'Favourites', icon: <BookmarkIcon size={16} /> },
                          { href: '/dashboard/generated', label: 'My prompts', icon: <SparkleIcon size={16} /> },
                          { href: '/profile', label: 'Profile', icon: <UserIcon size={16} /> },
                          { href: '/dashboard/settings', label: 'Settings', icon: <SettingsIcon size={16} /> },
                        ].map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            role="menuitem"
                            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--surface-sunken)]"
                          >
                            <span className="text-[var(--text-muted)]">{item.icon}</span>
                            {item.label}
                          </Link>
                        ))}

                        {viewer.isEditor && (
                          <Link
                            href="/admin"
                            role="menuitem"
                            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/50"
                          >
                            <GridIcon size={16} />
                            Admin panel
                          </Link>
                        )}

                        {!viewer.isPremium && (
                          <Link
                            href="/premium"
                            role="menuitem"
                            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-marigold-700 transition-colors hover:bg-marigold-50 dark:text-marigold-300 dark:hover:bg-marigold-900/30"
                          >
                            <CrownIcon size={16} />
                            Upgrade to Premium
                          </Link>
                        )}

                        <div className="mt-1 border-t border-[var(--border-subtle)] pt-1">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={signOut}
                            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                          >
                            <LogOutIcon size={16} />
                            Sign out
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <ButtonLink href="/login" variant="ghost" size="sm">
                  Log in
                </ButtonLink>
                <ButtonLink href="/register" size="sm">
                  Sign up free
                </ButtonLink>
              </div>
            )}

            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              className="grid size-10 place-items-center rounded-full text-body transition-colors hover:bg-[var(--surface-sunken)] lg:hidden"
            >
              {menuOpen ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="container-page pb-3 xl:hidden">
            <SearchBar
              autoFocus
              popularSearches={popularSearches}
              onNavigate={() => setSearchOpen(false)}
            />
          </div>
        )}
      </header>

      {/* Mobile slide-over navigation */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 cursor-default bg-ink-950/50 backdrop-blur-sm animate-[fade-in_0.16s_ease-out]"
          />
          <nav
            aria-label="Mobile"
            className="absolute inset-y-0 right-0 flex w-[min(20rem,86vw)] flex-col gap-1 border-l border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-lift)] animate-[fade-in_0.2s_ease-out]"
          >
            <div className="mb-3 flex items-center justify-between">
              <Logo size={30} />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="grid size-10 place-items-center rounded-full hover:bg-[var(--surface-sunken)]"
              >
                <CloseIcon size={20} />
              </button>
            </div>

            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-xl px-3.5 py-3 text-[0.9375rem] font-semibold transition-colors',
                  isActive(link.href)
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-200'
                    : 'hover:bg-[var(--surface-sunken)]',
                )}
              >
                {link.label}
              </Link>
            ))}

            <Link
              href="/random-prompt"
              className="rounded-xl px-3.5 py-3 text-[0.9375rem] font-semibold transition-colors hover:bg-[var(--surface-sunken)]"
            >
              Random prompt
            </Link>
            <Link
              href="/blog"
              className="rounded-xl px-3.5 py-3 text-[0.9375rem] font-semibold transition-colors hover:bg-[var(--surface-sunken)]"
            >
              Guides
            </Link>

            <div className="mt-auto grid gap-2 border-t border-[var(--border-subtle)] pt-4">
              <div className="flex items-center justify-between px-1 pb-1">
                <span className="text-xs font-semibold text-faint">Theme</span>
                <ThemeToggleButton />
              </div>
              {viewer.isAuthenticated ? (
                <>
                  <ButtonLink href="/dashboard" fullWidth>
                    Open dashboard
                  </ButtonLink>
                  <button
                    type="button"
                    onClick={signOut}
                    className="h-11 rounded-xl text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <ButtonLink href="/register" fullWidth>
                    Sign up free
                  </ButtonLink>
                  <ButtonLink href="/login" variant="outline" fullWidth>
                    Log in
                  </ButtonLink>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
