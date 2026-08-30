import { useEffect, useState } from 'react';

import { SETTING_KEYS } from '@pd/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/use-api';

/**
 * Runtime settings.
 *
 * Two problems with the previous version, both stemming from the same design:
 * `save()` iterated the `GROUPS` array, so any key not listed there could never be
 * written even though `GET /settings` returned it. Seven keys were therefore
 * permanently uneditable, including `ops.maintenance_mode` — there was no way to
 * put the site into maintenance mode from the console at all — and
 * `payments.currency`, which billing reads.
 *
 * The second problem was that every field was a bare text input, so booleans were
 * edited by typing the words "true" and "false" and were re-coerced on the way
 * out. That works and is unpleasant, and it silently accepts "ture".
 *
 * Fields are now typed. `kind` drives both the control and the coercion, which
 * means the two can no longer disagree — the previous `coerce()` inferred a type
 * from the string's shape, so a site name of "2024" would have been saved as a
 * number.
 */

type SettingValue = string | number | boolean;

interface Capabilities {
  payments: string;
  ai: string;
  storage: string;
  email: string;
}

type FieldKind = 'text' | 'number' | 'boolean' | 'textarea' | 'select';

interface SettingField {
  key: string;
  label: string;
  kind: FieldKind;
  hint?: string;
  options?: { value: string; label: string }[];
  /** Rendered full-width in the two-column grid. */
  wide?: boolean;
}

interface SettingGroup {
  title: string;
  description: string;
  fields: SettingField[];
  /** Draws the card in a warning tone — used for destructive-ish switches. */
  danger?: boolean;
}

const GROUPS: SettingGroup[] = [
  {
    title: 'Branding',
    description: 'Shown across the website, emails and metadata.',
    fields: [
      { key: SETTING_KEYS.siteName, label: 'Site name', kind: 'text' },
      { key: SETTING_KEYS.siteTagline, label: 'Tagline', kind: 'text' },
      { key: SETTING_KEYS.siteDomain, label: 'Domain', kind: 'text' },
      { key: SETTING_KEYS.siteLogoUrl, label: 'Logo URL', kind: 'text' },
      { key: SETTING_KEYS.siteFaviconUrl, label: 'Favicon URL', kind: 'text' },
    ],
  },
  {
    title: 'SEO defaults',
    description:
      'Used when a page has nothing more specific. None of these had an input before, so they have been sitting at their defaults.',
    fields: [
      {
        key: SETTING_KEYS.seoTitleTemplate,
        label: 'Title template',
        kind: 'text',
        hint: 'Use %s where the page title goes, e.g. "%s | promptduniya".',
        wide: true,
      },
      {
        key: SETTING_KEYS.seoDefaultDescription,
        label: 'Default meta description',
        kind: 'textarea',
        wide: true,
      },
      {
        key: SETTING_KEYS.seoDefaultKeywords,
        label: 'Default keywords',
        kind: 'text',
        hint: 'Comma separated. Largely ignored by search engines; harmless to leave empty.',
        wide: true,
      },
    ],
  },
  {
    title: 'Contact',
    description: 'Published on the contact page and in structured data.',
    fields: [
      { key: SETTING_KEYS.contactEmail, label: 'Contact email', kind: 'text' },
      { key: SETTING_KEYS.contactPhone, label: 'Phone', kind: 'text' },
      { key: SETTING_KEYS.contactAddress, label: 'Address', kind: 'textarea', wide: true },
    ],
  },
  {
    title: 'Social',
    description: 'Linked in the footer and in structured data.',
    fields: [
      { key: SETTING_KEYS.socialInstagram, label: 'Instagram', kind: 'text' },
      { key: SETTING_KEYS.socialX, label: 'X', kind: 'text' },
      { key: SETTING_KEYS.socialYoutube, label: 'YouTube', kind: 'text' },
      { key: SETTING_KEYS.socialTelegram, label: 'Telegram', kind: 'text' },
    ],
  },
  {
    title: 'Guest limits',
    description: 'Applied to visitors who are not signed in. Use -1 for unlimited.',
    fields: [
      { key: SETTING_KEYS.anonCopiesPerDay, label: 'Copies per day', kind: 'number' },
      { key: SETTING_KEYS.anonGeneratorPerDay, label: 'Generator runs per day', kind: 'number' },
    ],
  },
  {
    title: 'Free member limits',
    description: 'Daily allowances for a signed-in member without a plan.',
    fields: [
      { key: SETTING_KEYS.freeCopiesPerDay, label: 'Copies per day', kind: 'number' },
      { key: SETTING_KEYS.freeGeneratorPerDay, label: 'Generator runs per day', kind: 'number' },
      { key: SETTING_KEYS.freeFavorites, label: 'Saved prompts', kind: 'number' },
    ],
  },
  {
    title: 'Premium limits',
    description: 'Applied when a plan does not override them. -1 means unlimited.',
    fields: [
      { key: SETTING_KEYS.premiumCopiesPerDay, label: 'Copies per day', kind: 'number' },
      { key: SETTING_KEYS.premiumGeneratorPerDay, label: 'Generator runs per day', kind: 'number' },
      { key: SETTING_KEYS.premiumFavorites, label: 'Saved prompts', kind: 'number' },
    ],
  },
  {
    title: 'Payments',
    description: 'Provider keys are secrets and are set with wrangler, not here.',
    fields: [
      {
        key: SETTING_KEYS.currency,
        label: 'Currency',
        kind: 'select',
        hint: 'Amounts are stored in the smallest unit of this currency.',
        options: [
          { value: 'INR', label: 'INR — Indian rupee' },
          { value: 'USD', label: 'USD — US dollar' },
          { value: 'EUR', label: 'EUR — Euro' },
          { value: 'GBP', label: 'GBP — Pound sterling' },
        ],
      },
      { key: SETTING_KEYS.paymentsEnabled, label: 'Payments enabled', kind: 'boolean' },
    ],
  },
  {
    title: 'Members',
    description: 'Who can join, and what they must do first.',
    fields: [
      { key: SETTING_KEYS.registrationEnabled, label: 'Registration open', kind: 'boolean' },
      {
        key: SETTING_KEYS.requireEmailVerification,
        label: 'Require email verification',
        kind: 'boolean',
        hint: 'Needs a working email provider, or nobody will be able to finish signing up.',
      },
    ],
  },
  {
    title: 'Site behaviour',
    description: 'Switches that change what visitors see.',
    danger: true,
    fields: [
      {
        key: SETTING_KEYS.maintenanceMode,
        label: 'Maintenance mode',
        kind: 'boolean',
        hint: 'Takes the public site offline for visitors. The console stays reachable.',
        wide: true,
      },
      { key: SETTING_KEYS.adsEnabled, label: 'Ads enabled', kind: 'boolean' },
      {
        key: SETTING_KEYS.analyticsEnabled,
        label: 'Analytics enabled',
        kind: 'boolean',
        hint: 'When off, no page views or events are recorded and the charts stop filling.',
      },
    ],
  },
];

/** Every key this screen can write. Used to send only what it understands. */
const EDITABLE = new Set(GROUPS.flatMap((group) => group.fields.map((field) => field.key)));

export function SettingsPage() {
  const settings = useQuery<Record<string, SettingValue>>('/v1/admin/settings');
  const brand = useQuery<{ capabilities: Capabilities }>('/v1/catalog/brand');
  const { run, pending, error } = useMutation();

  const [draft, setDraft] = useState<Record<string, SettingValue>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setDraft({ ...settings.data });
  }, [settings.data]);

  /**
   * Coerces by declared kind rather than by guessing from the string.
   *
   * The old implementation inferred the type from the value's shape, which meant a
   * numeric-looking site name became a number and any unrecognised word became a
   * string — so a mistyped boolean was stored as the literal text.
   */
  function valueFor(field: SettingField): SettingValue {
    const raw = draft[field.key];
    switch (field.kind) {
      case 'boolean':
        return raw === true || raw === 'true' || raw === 1 || raw === '1';
      case 'number': {
        const parsed = typeof raw === 'number' ? raw : Number(raw);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      default:
        return raw === undefined || raw === null ? '' : String(raw);
    }
  }

  async function save() {
    const payload: Record<string, SettingValue> = {};
    for (const group of GROUPS) {
      for (const field of group.fields) {
        if (!EDITABLE.has(field.key)) continue;
        payload[field.key] = valueFor(field);
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

  const maintenanceOn = valueFor({
    key: SETTING_KEYS.maintenanceMode,
    label: '',
    kind: 'boolean',
  }) === true;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Runtime configuration. Automation has its own screen; secrets are set with wrangler."
        actions={
          <Button loading={pending} onClick={() => void save()}>
            Save changes
          </Button>
        }
      />

      {error && <Alert>{error}</Alert>}
      {saved && <Alert tone="success">Settings saved.</Alert>}
      {settings.error && <Alert>{settings.error}</Alert>}

      {/* Surfaced at the top because it is the one setting here whose effect is
          immediate and total, and it is easy to forget it is on. */}
      {maintenanceOn && (
        <div className="mb-4">
          <Alert tone="danger">
            Maintenance mode is on — the public site is offline for visitors. Turn it off under Site
            behaviour and save.
          </Alert>
        </div>
      )}

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
          <Card
            key={group.title}
            title={group.title}
            description={group.description}
            className={group.danger ? 'border-amber-300 dark:border-amber-900' : undefined}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {group.fields.map((field) => (
                <div key={field.key} className={field.wide ? 'sm:col-span-2' : undefined}>
                  <SettingInput
                    field={field}
                    value={valueFor(field)}
                    onChange={(value) => setDraft((prev) => ({ ...prev, [field.key]: value }))}
                  />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Button loading={pending} onClick={() => void save()}>
          Save changes
        </Button>
      </div>
    </>
  );
}

function SettingInput({
  field,
  value,
  onChange,
}: {
  field: SettingField;
  value: SettingValue;
  onChange(value: SettingValue): void;
}) {
  // Booleans render as their own labelled checkbox rather than inside a Field,
  // whose label sits above the control and reads oddly next to a tick box.
  if (field.kind === 'boolean') {
    return (
      <div>
        <Checkbox
          label={field.label}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        <p className="mt-1 pl-6 text-xs text-[var(--text-muted)]">{field.hint ?? field.key}</p>
      </div>
    );
  }

  return (
    <Field label={field.label} hint={field.hint ?? field.key}>
      {field.kind === 'textarea' ? (
        <Textarea
          rows={2}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.kind === 'select' ? (
        <Select value={String(value)} onChange={(event) => onChange(event.target.value)}>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : field.kind === 'number' ? (
        <Input
          type="number"
          value={String(value)}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      ) : (
        <Input value={String(value)} onChange={(event) => onChange(event.target.value)} />
      )}
    </Field>
  );
}
