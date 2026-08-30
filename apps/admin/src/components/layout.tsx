import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '@/lib/auth';
import {
  AnalyticsIcon,
  ArticlesIcon,
  AutomationIcon,
  BellIcon,
  BillingIcon,
  CategoriesIcon,
  CloseIcon,
  CouponsIcon,
  DashboardIcon,
  LogsIcon,
  TagsIcon,
  ExternalIcon,
  LogOutIcon,
  MediaIcon,
  MenuIcon,
  ModerationIcon,
  PlansIcon,
  PromptsIcon,
  SettingsIcon,
  SparkleIcon,
  UsersIcon,
  type IconProps,
} from './icons';
import { ErrorBoundary } from './error-boundary';
import { ThemeToggle } from './theme';
import { cn } from './ui';

/**
 * Console shell.
 *
 * A dark sidebar against a light content area, which does two jobs at once: it
 * separates chrome from content so the eye knows where to look, and it makes the
 * console unmistakable at a glance next to a tab of the public site. Mixing the
 * two up is a real hazard when both are open all day.
 *
 * On small screens the sidebar becomes a slide-over drawer. It used to be a
 * horizontally-scrolling strip of every link, which meant the later items —
 * Users, Settings — were effectively hidden behind a swipe.
 */

interface NavItem {
  to: string;
  label: string;
  icon: (props: IconProps) => React.ReactElement;
  adminOnly?: boolean;
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: DashboardIcon },
      { to: '/analytics', label: 'Analytics', icon: AnalyticsIcon },
    ],
  },
  {
    group: 'Content',
    items: [
      { to: '/automation', label: 'Automation', icon: AutomationIcon },
      { to: '/studio', label: 'AI Studio', icon: SparkleIcon },
      { to: '/prompts', label: 'Prompts', icon: PromptsIcon },
      { to: '/categories', label: 'Categories', icon: CategoriesIcon },
      { to: '/tags', label: 'Tags', icon: TagsIcon },
      { to: '/articles', label: 'Articles', icon: ArticlesIcon },
      { to: '/media', label: 'Media', icon: MediaIcon },
    ],
  },
  {
    group: 'Community',
    items: [
      { to: '/moderation', label: 'Moderation', icon: ModerationIcon },
      { to: '/notifications', label: 'Notifications', icon: BellIcon, adminOnly: true },
    ],
  },
  {
    group: 'Business',
    items: [
      { to: '/plans', label: 'Plans', icon: PlansIcon, adminOnly: true },
      { to: '/coupons', label: 'Coupons', icon: CouponsIcon, adminOnly: true },
      { to: '/billing', label: 'Billing', icon: BillingIcon, adminOnly: true },
      { to: '/users', label: 'Users', icon: UsersIcon, adminOnly: true },
    ],
  },
  {
    group: 'System',
    items: [
      { to: '/ai-providers', label: 'AI providers', icon: SparkleIcon, adminOnly: true },
      { to: '/logs', label: 'Audit log', icon: LogsIcon, adminOnly: true },
      { to: '/settings', label: 'Settings', icon: SettingsIcon, adminOnly: true },
    ],
  },
];

/** The console's own mark, so the sidebar is not just a bold word. */
function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="admin-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6F4FF7" />
          <stop offset="100%" stopColor="#8A72FB" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill="url(#admin-logo)" />
      <g stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none">
        <circle cx="24" cy="24" r="9" strokeOpacity="0.9" />
        <path d="M24 11v6M24 31v6M11 24h6M31 24h6" strokeOpacity="0.55" />
      </g>
    </svg>
  );
}

function NavLinks({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  return (
    <>
      {NAV.map((section) => {
        const items = section.items.filter((item) => !item.adminOnly || isAdmin);
        if (items.length === 0) return null;
        return (
          <div key={section.group} className="mb-5">
            <p className="px-3 pb-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-[var(--nav-text)]/60">
              {section.group}
            </p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-[var(--nav-active-bg)] text-[var(--nav-text-active)]'
                            : 'text-[var(--nav-text)] hover:bg-[var(--nav-active-bg)]/55 hover:text-[var(--nav-text-active)]',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {/* Left rail marker — a clearer active signal than a
                              background tint alone, especially in dark mode. */}
                          <span
                            aria-hidden="true"
                            className={cn(
                              'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-400 transition-opacity',
                              isActive ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <Icon size={17} className="shrink-0" />
                          {item.label}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function SidebarFooter({
  name,
  email,
  role,
  onSignOut,
}: {
  name: string;
  email: string;
  role: string;
  onSignOut(): void;
}) {
  return (
    <div className="border-t border-[var(--nav-border)] p-3">
      <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">
          {name.slice(0, 1).toUpperCase() || 'A'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--nav-text-active)]">{name}</p>
          <p className="truncate text-xs text-[var(--nav-text)]">{email}</p>
        </div>
      </div>
      <p className="mt-1 px-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--nav-text)]/70">
        {role}
      </p>
      <button
        type="button"
        onClick={onSignOut}
        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--nav-border)] px-3 py-2 text-sm font-semibold text-[var(--nav-text)] transition-colors hover:bg-[var(--nav-active-bg)] hover:text-[var(--nav-text-active)]"
      >
        <LogOutIcon size={15} />
        Sign out
      </button>
    </div>
  );
}

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close the drawer on navigation, and stop the page behind it scrolling while
  // it is open.
  useEffect(() => setDrawerOpen(false), [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const isAdmin = Boolean(user?.isAdmin);
  const name = user?.name ?? 'Admin';
  const email = user?.email ?? '';
  const role = isAdmin ? 'Administrator' : 'Editor';

  return (
    <div className="flex min-h-dvh">
      {/* ------------------------------ Desktop rail ------------------------------ */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-[15.5rem] flex-col border-r bg-[var(--nav-bg)] lg:flex"
        style={{ borderColor: 'var(--nav-border)' }}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--nav-border)] px-4 py-4">
          <LogoMark />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--nav-text-active)]">promptduniya</p>
            <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-[var(--nav-text)]">
              Admin console
            </p>
          </div>
        </div>

        <nav className="scrollbar-slim flex-1 overflow-y-auto px-2.5 py-4">
          <NavLinks isAdmin={isAdmin} />
        </nav>

        <SidebarFooter name={name} email={email} role={role} onSignOut={() => void signOut()} />
      </aside>

      {/* ------------------------------ Mobile drawer ----------------------------- */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 cursor-default bg-navy-950/60 backdrop-blur-sm animate-[admin-fade-in_0.16s_ease-out]"
          />
          <div className="absolute inset-y-0 left-0 flex w-[16rem] flex-col bg-[var(--nav-bg)] shadow-[var(--shadow-pop)] animate-[admin-slide-in_0.22s_cubic-bezier(0.16,1,0.3,1)]">
            <div className="flex items-center justify-between border-b border-[var(--nav-border)] px-4 py-4">
              <div className="flex items-center gap-2.5">
                <LogoMark size={26} />
                <p className="text-sm font-bold text-[var(--nav-text-active)]">Admin</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="grid size-8 place-items-center rounded-lg text-[var(--nav-text)] hover:bg-[var(--nav-active-bg)]"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <nav className="scrollbar-slim flex-1 overflow-y-auto px-2.5 py-4">
              <NavLinks isAdmin={isAdmin} onNavigate={() => setDrawerOpen(false)} />
            </nav>
            <SidebarFooter name={name} email={email} role={role} onSignOut={() => void signOut()} />
          </div>
        </div>
      )}

      {/* -------------------------------- Content -------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-[15.5rem]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-[var(--border-line)] bg-[var(--surface-raised)]/92 px-3 backdrop-blur-xl sm:px-5">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="grid size-9 place-items-center rounded-lg text-[var(--text-body)] transition-colors hover:bg-[var(--surface-hover)] lg:hidden"
          >
            <MenuIcon size={19} />
          </button>

          <span className="text-sm font-semibold lg:hidden">promptduniya admin</span>

          <div className="ml-auto flex items-center gap-1">
            <a
              href="https://promptduniya-web.onlineilovegames.workers.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-[var(--text-body)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)] sm:inline-flex"
            >
              View site
              <ExternalIcon size={14} />
            </a>
            <ThemeToggle />
            <span
              className="ml-1 grid size-8 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white"
              title={`${name} · ${role}`}
            >
              {name.slice(0, 1).toUpperCase() || 'A'}
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-5 sm:px-5 sm:py-7">
          {/* Keyed by path so a screen that threw is retried on navigation and
              the failure stays contained to that screen — the sidebar and the
              rest of the console keep working. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
