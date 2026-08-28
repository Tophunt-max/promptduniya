import { NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '@/lib/auth';
import { Button, cn } from './ui';

/** Sidebar shell. Admin-only links are hidden for editors. */

interface NavItem {
  to: string;
  label: string;
  adminOnly?: boolean;
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Overview',
    items: [{ to: '/', label: 'Dashboard' }],
  },
  {
    group: 'Content',
    items: [
      { to: '/prompts', label: 'Prompts' },
      { to: '/categories', label: 'Categories' },
      { to: '/articles', label: 'Articles' },
      { to: '/media', label: 'Media' },
    ],
  },
  {
    group: 'Community',
    items: [{ to: '/moderation', label: 'Moderation' }],
  },
  {
    group: 'Business',
    items: [
      { to: '/plans', label: 'Plans', adminOnly: true },
      { to: '/coupons', label: 'Coupons', adminOnly: true },
      { to: '/billing', label: 'Billing', adminOnly: true },
      { to: '/users', label: 'Users', adminOnly: true },
      { to: '/settings', label: 'Settings', adminOnly: true },
    ],
  },
];

export function AdminLayout() {
  const { user, signOut } = useAuth();

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="border-b border-line px-4 py-4">
          <p className="text-sm font-bold tracking-tight text-ink">promptduniya</p>
          <p className="text-xs text-muted">Admin console</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV.map((section) => {
            const items = section.items.filter((item) => !item.adminOnly || user?.isAdmin);
            if (items.length === 0) return null;
            return (
              <div key={section.group} className="mb-4">
                <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted">
                  {section.group}
                </p>
                <ul>
                  {items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/'}
                        className={({ isActive }) =>
                          cn(
                            'block rounded-lg px-2 py-1.5 text-sm font-medium transition',
                            isActive
                              ? 'bg-brand-50 text-brand-700'
                              : 'text-body hover:bg-canvas hover:text-ink',
                          )
                        }
                      >
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-line px-4 py-3">
          <p className="truncate text-sm font-semibold text-ink">{user?.name}</p>
          <p className="truncate text-xs text-muted">{user?.email}</p>
          <p className="mt-1 text-xs text-muted">{user?.isAdmin ? 'Administrator' : 'Editor'}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full"
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Compact top bar for narrow screens, where the sidebar is hidden. */}
        <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
          <p className="text-sm font-bold text-ink">promptduniya admin</p>
          <Button variant="outline" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-2 py-2 lg:hidden">
          {NAV.flatMap((section) =>
            section.items.filter((item) => !item.adminOnly || user?.isAdmin),
          ).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'shrink-0 rounded-lg px-2.5 py-1 text-sm font-medium',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-body',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <main className="mx-auto max-w-6xl px-4 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
