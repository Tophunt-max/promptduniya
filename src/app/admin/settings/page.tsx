import type { Metadata } from 'next';

import { AdminShell } from '@/components/admin/admin-shell';
import { SettingsEditor } from '@/components/admin/settings-editor';
import { requireStrictAdminPage } from '@/lib/auth/guards';
import { aiConfigured, razorpayConfigured, storageConfigured } from '@/lib/env';
import { getSettings } from '@/services/settings';
import { storageMode } from '@/services/storage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Settings' };

export default async function AdminSettingsPage() {
  await requireStrictAdminPage();
  const settings = await getSettings();

  return (
    <AdminShell
      title="Settings"
      description="Branding, SEO defaults, plan limits and operational toggles. Changes take effect within 30 seconds."
    >
      <SettingsEditor
        initial={settings}
        integrations={{
          payments: razorpayConfigured() ? 'razorpay' : 'mock',
          ai: aiConfigured() ? 'configured' : 'template',
          storage: storageConfigured() ? storageMode() : 'local',
        }}
      />
    </AdminShell>
  );
}
