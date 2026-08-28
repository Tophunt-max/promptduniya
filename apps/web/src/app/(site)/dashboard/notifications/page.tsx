import type { Metadata } from 'next';

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { NotificationList } from '@/components/dashboard/notification-list';
import { requireUserPage } from '@/lib/auth/guards';
import { buildMetadata } from '@/lib/seo';
import { getPreferences, listNotifications } from '@/services/notifications';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Notifications',
  path: '/dashboard/notifications',
  noIndex: true,
});

export default async function NotificationsPage() {
  const user = await requireUserPage('/dashboard/notifications');
  const [items, preferences] = await Promise.all([
    listNotifications(user.id, 40),
    getPreferences(user.id),
  ]);

  return (
    <DashboardShell
      title="Notifications"
      description="Membership updates, payment receipts and new prompt alerts."
    >
      <NotificationList items={items} preferences={preferences} />
    </DashboardShell>
  );
}
