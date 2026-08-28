import type { Metadata } from 'next';

import { AdminShell } from '@/components/admin/admin-shell';
import { SettingsEditor } from '@/components/admin/settings-editor';
import { requireStrictAdminPage } from '@/lib/auth/guards';
import { getCapabilities, getSettings } from '@/services/settings';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Settings' };

export default async function AdminSettingsPage() {
  await requireStrictAdminPage();
  const [settings, capabilities] = await Promise.all([getSettings(), getCapabilities()]);

  return (
    <AdminShell
      title="Settings"
      description="Branding, SEO defaults, plan limits and operational toggles. Changes take effect within 30 seconds."
    >
      <SettingsEditor
        initial={settings}
        integrations={{
          payments: capabilities.payments,
          ai: capabilities.ai,
          storage: capabilities.storage,
        }}
      />
    </AdminShell>
  );
}
