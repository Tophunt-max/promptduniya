import { useEffect, useState } from 'react';

import { SETTING_KEYS } from '@pd/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Spinner,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/use-api';

type SettingValue = string | number | boolean;

interface Capabilities {
  payments: string;
  ai: string;
  storage: string;
  email: string;
}

/** Grouped editor so related toggles stay together. */
const GROUPS: { title: string; description: string; keys: { key: string; label: string }[] }[] = [
  {
    title: 'Branding',
    description: 'Shown across the website, emails and metadata.',
    keys: [
      { key: SETTING_KEYS.siteName, label: 'Site name' },
      { key: SETTING_KEYS.siteTagline, label: 'Tagline' },
      { key: SETTING_KEYS.siteDomain, label: 'Domain' },
      { key: SETTING_KEYS.siteLogoUrl, label: 'Logo URL' },
      { key: SETTING_KEYS.siteFaviconUrl, label: 'Favicon URL' },
      { key: SETTING_KEYS.contactEmail, label: 'Contact email' },
    ],
  },
  {
    title: 'Social',
    description: 'Linked in the footer and in structured data.',
    keys: [
      { key: SETTING_KEYS.socialInstagram, label: 'Instagram' },
      { key: SETTING_KEYS.socialX, label: 'X' },
      { key: SETTING_KEYS.socialYoutube, label: 'YouTube' },
      { key: SETTING_KEYS.socialTelegram, label: 'Telegram' },
    ],
  },
  {
    title: 'Free & guest limits',
    description: 'Daily allowances. Use -1 for unlimited.',
    keys: [
      { key: SETTING_KEYS.anonCopiesPerDay, label: 'Guest copies / day' },
      { key: SETTING_KEYS.anonGeneratorPerDay, label: 'Guest generator / day' },
      { key: SETTING_KEYS.freeCopiesPerDay, label: 'Free copies / day' },
      { key: SETTING_KEYS.freeFavorites, label: 'Free favourites' },
      { key: SETTING_KEYS.freeGeneratorPerDay, label: 'Free generator / day' },
    ],
  },
  {
    title: 'Premium limits',
    description: 'Applied when a plan does not override them.',
    keys: [
      { key: SETTING_KEYS.premiumCopiesPerDay, label: 'Premium copies / day' },
      { key: SETTING_KEYS.premiumFavorites, label: 'Premium favourites' },
      { key: SETTING_KEYS.premiumGeneratorPerDay, label: 'Premium generator / day' },
    ],
  },
  {
    title: 'Toggles',
    description: 'Use true or false.',
    keys: [
      { key: SETTING_KEYS.paymentsEnabled, label: 'Payments enabled' },
      { key: SETTING_KEYS.registrationEnabled, label: 'Registration enabled' },
      { key: SETTING_KEYS.requireEmailVerification, label: 'Require email verification' },
      { key: SETTING_KEYS.adsEnabled, label: 'Ads enabled' },
      { key: SETTING_KEYS.analyticsEnabled, label: 'Analytics enabled' },
    ],
  },
];

export function SettingsPage() {
  const settings = useQuery<Record<string, SettingValue>>('/v1/admin/settings');
  const brand = useQuery<{ capabilities: Capabilities }>('/v1/catalog/brand');
  const { run, pending, error } = useMutation();

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(settings.data)) next[key] = String(value);
    setDraft(next);
  }, [settings.data]);

  /**
   * Re-types each value before sending: the API stores a value type per setting,
   * so "12" must arrive as a number and "true" as a boolean.
   */
  function coerce(raw: string): SettingValue {
    const trimmed = raw.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
    return raw;
  }

  async function save() {
    const payload: Record<string, SettingValue> = {};
    for (const group of GROUPS) {
      for (const { key } of group.keys) {
        if (draft[key] === undefined) continue;
        payload[key] = coerce(draft[key]);
      }
    }
    const result = await run(() => api.put('/v1/admin/settings', payload));
    if (result !== null) {
      setSaved(true);
      settings.reload();
      setTimeout(() => setSaved(false), 3000);
    }
  }

  if (settings.loading && !settings.data) return <Spinner label="Loading settings" />;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Runtime configuration. Changes apply within a minute of saving."
        actions={
          <Button loading={pending} onClick={() => void save()}>
            Save changes
          </Button>
        }
      />

      {error && <Alert>{error}</Alert>}
      {saved && <Alert tone="success">Settings saved.</Alert>}
      {settings.error && <Alert>{settings.error}</Alert>}

      {brand.data && (
        <Card title="Integrations" description="Reported by the API; configured with secrets.">
          <div className="flex flex-wrap gap-2">
            <Badge tone={brand.data.capabilities.payments === 'razorpay' ? 'success' : 'warning'}>
              Payments: {brand.data.capabilities.payments}
            </Badge>
            <Badge tone={brand.data.capabilities.ai === 'configured' ? 'success' : 'neutral'}>
              AI: {brand.data.capabilities.ai}
            </Badge>
            <Badge tone="neutral">Storage: {brand.data.capabilities.storage}</Badge>
            <Badge tone="neutral">Email: {brand.data.capabilities.email}</Badge>
          </div>
        </Card>
      )}

      <div className="mt-4 space-y-4">
        {GROUPS.map((group) => (
          <Card key={group.title} title={group.title} description={group.description}>
            <div className="grid gap-4 sm:grid-cols-2">
              {group.keys.map(({ key, label }) => (
                <Field key={key} label={label} hint={key}>
                  <Input
                    value={draft[key] ?? ''}
                    onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                  />
                </Field>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
