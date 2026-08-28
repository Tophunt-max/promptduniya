'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiClientError, api } from '@/lib/client-api';
import { SETTING_KEYS } from '@/lib/constants';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input, Switch, Textarea } from '../ui/field';
import { AlertIcon, InfoIcon } from '../ui/icon';
import { useToast } from '../ui/toast';

type SettingValue = string | number | boolean;

/**
 * Runtime settings editor.
 *
 * Everything here is stored in the database rather than in code, which is what
 * lets limits, prices and branding change without a deployment. Secrets are
 * deliberately absent — those stay in environment variables and are only
 * reported as "configured or not" below.
 */
export function SettingsEditor({
  initial,
  integrations,
}: {
  initial: Record<string, SettingValue>;
  integrations: { payments: string; ai: string; storage: string };
}) {
  const router = useRouter();
  const toast = useToast();

  const [values, setValues] = useState<Record<string, SettingValue>>(initial);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  function set(key: string, value: SettingValue) {
    setValues((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  const str = (key: string) => String(values[key] ?? '');
  const num = (key: string) => Number(values[key] ?? 0);
  const bool = (key: string) => values[key] === true || values[key] === 'true';

  async function save() {
    setSaving(true);
    try {
      await api.put('/api/admin/settings', { values });
      toast.success('Settings saved', 'Changes are live within 30 seconds.');
      setDirty(false);
      router.refresh();
    } catch (error) {
      toast.error(
        'Could not save settings',
        error instanceof ApiClientError ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 pb-24">
      <section className="card p-5">
        <h2 className="mb-1 text-sm font-bold">Integration status</h2>
        <p className="mb-4 text-xs text-body">
          These are configured with environment variables, not here — secrets are never editable
          from the browser.
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge tone={integrations.payments === 'razorpay' ? 'success' : 'marigold'}>
            Payments: {integrations.payments === 'razorpay' ? 'Razorpay (live)' : 'Mock / test mode'}
          </Badge>
          <Badge tone={integrations.ai === 'configured' ? 'success' : 'neutral'}>
            AI generator: {integrations.ai === 'configured' ? 'Provider configured' : 'Template engine'}
          </Badge>
          <Badge tone={integrations.storage === 'local' ? 'neutral' : 'success'}>
            Media storage: {integrations.storage === 'local' ? 'Local disk' : 'Object storage'}
          </Badge>
        </div>
      </section>

      <fieldset className="card grid gap-4 p-5">
        <legend className="px-1 text-sm font-bold">Branding</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Site name"
            value={str(SETTING_KEYS.siteName)}
            onChange={(event) => set(SETTING_KEYS.siteName, event.target.value)}
          />
          <Input
            label="Primary domain"
            value={str(SETTING_KEYS.siteDomain)}
            onChange={(event) => set(SETTING_KEYS.siteDomain, event.target.value)}
            hint="Used in metadata and emails. Not hard-coded anywhere."
          />
          <Input
            label="Tagline"
            value={str(SETTING_KEYS.siteTagline)}
            onChange={(event) => set(SETTING_KEYS.siteTagline, event.target.value)}
            containerClassName="sm:col-span-2"
          />
          <Input
            label="Logo URL"
            value={str(SETTING_KEYS.siteLogoUrl)}
            onChange={(event) => set(SETTING_KEYS.siteLogoUrl, event.target.value)}
            hint="Leave blank to use the built-in mark."
          />
          <Input
            label="Favicon URL"
            value={str(SETTING_KEYS.siteFaviconUrl)}
            onChange={(event) => set(SETTING_KEYS.siteFaviconUrl, event.target.value)}
          />
        </div>
      </fieldset>

      <fieldset className="card grid gap-4 p-5">
        <legend className="px-1 text-sm font-bold">SEO defaults</legend>
        <Input
          label="Title template"
          value={str(SETTING_KEYS.seoTitleTemplate)}
          onChange={(event) => set(SETTING_KEYS.seoTitleTemplate, event.target.value)}
          hint="Use %s where the page title should go."
        />
        <Textarea
          label="Default meta description"
          value={str(SETTING_KEYS.seoDefaultDescription)}
          onChange={(event) => set(SETTING_KEYS.seoDefaultDescription, event.target.value)}
          rows={3}
          maxLength={320}
        />
        <Input
          label="Default keywords"
          value={str(SETTING_KEYS.seoDefaultKeywords)}
          onChange={(event) => set(SETTING_KEYS.seoDefaultKeywords, event.target.value)}
          hint="Comma-separated."
        />
      </fieldset>

      <fieldset className="card grid gap-4 p-5">
        <legend className="px-1 text-sm font-bold">Free plan limits</legend>
        <p className="flex items-start gap-2 text-xs text-body">
          <InfoIcon size={14} className="mt-px shrink-0" />
          Use −1 for unlimited. These are enforced server-side on every request, and daily counters
          reset at midnight IST.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            type="number"
            label="Copies per day"
            value={num(SETTING_KEYS.freeCopiesPerDay)}
            onChange={(event) => set(SETTING_KEYS.freeCopiesPerDay, Number(event.target.value))}
          />
          <Input
            type="number"
            label="Saved favourites"
            value={num(SETTING_KEYS.freeFavorites)}
            onChange={(event) => set(SETTING_KEYS.freeFavorites, Number(event.target.value))}
          />
          <Input
            type="number"
            label="Generator runs per day"
            value={num(SETTING_KEYS.freeGeneratorPerDay)}
            onChange={(event) => set(SETTING_KEYS.freeGeneratorPerDay, Number(event.target.value))}
          />
        </div>
      </fieldset>

      <fieldset className="card grid gap-4 p-5">
        <legend className="px-1 text-sm font-bold">Guest (not signed in) limits</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            type="number"
            label="Copies per day"
            value={num(SETTING_KEYS.anonCopiesPerDay)}
            onChange={(event) => set(SETTING_KEYS.anonCopiesPerDay, Number(event.target.value))}
          />
          <Input
            type="number"
            label="Generator runs per day"
            value={num(SETTING_KEYS.anonGeneratorPerDay)}
            onChange={(event) => set(SETTING_KEYS.anonGeneratorPerDay, Number(event.target.value))}
          />
        </div>
      </fieldset>

      <fieldset className="card grid gap-4 p-5">
        <legend className="px-1 text-sm font-bold">Premium fallback limits</legend>
        <p className="text-xs text-body">
          Applied when a plan does not define its own limits. Individual plan limits, set on the
          Plans page, take precedence.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            type="number"
            label="Copies per day"
            value={num(SETTING_KEYS.premiumCopiesPerDay)}
            onChange={(event) => set(SETTING_KEYS.premiumCopiesPerDay, Number(event.target.value))}
          />
          <Input
            type="number"
            label="Saved favourites"
            value={num(SETTING_KEYS.premiumFavorites)}
            onChange={(event) => set(SETTING_KEYS.premiumFavorites, Number(event.target.value))}
          />
          <Input
            type="number"
            label="Generator runs per day"
            value={num(SETTING_KEYS.premiumGeneratorPerDay)}
            onChange={(event) => set(SETTING_KEYS.premiumGeneratorPerDay, Number(event.target.value))}
          />
        </div>
      </fieldset>

      <fieldset className="card grid gap-4 p-5">
        <legend className="px-1 text-sm font-bold">Contact and social</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            type="email"
            label="Contact email"
            value={str(SETTING_KEYS.contactEmail)}
            onChange={(event) => set(SETTING_KEYS.contactEmail, event.target.value)}
            hint="Shown publicly in the footer and contact page."
          />
          <Input
            label="Contact phone"
            value={str(SETTING_KEYS.contactPhone)}
            onChange={(event) => set(SETTING_KEYS.contactPhone, event.target.value)}
            hint="Leave blank to hide."
          />
          <Input
            label="Address"
            value={str(SETTING_KEYS.contactAddress)}
            onChange={(event) => set(SETTING_KEYS.contactAddress, event.target.value)}
            containerClassName="sm:col-span-2"
          />
          <Input
            label="Instagram URL"
            value={str(SETTING_KEYS.socialInstagram)}
            onChange={(event) => set(SETTING_KEYS.socialInstagram, event.target.value)}
          />
          <Input
            label="X (Twitter) URL"
            value={str(SETTING_KEYS.socialX)}
            onChange={(event) => set(SETTING_KEYS.socialX, event.target.value)}
          />
          <Input
            label="YouTube URL"
            value={str(SETTING_KEYS.socialYoutube)}
            onChange={(event) => set(SETTING_KEYS.socialYoutube, event.target.value)}
          />
          <Input
            label="Telegram URL"
            value={str(SETTING_KEYS.socialTelegram)}
            onChange={(event) => set(SETTING_KEYS.socialTelegram, event.target.value)}
          />
        </div>
      </fieldset>

      <fieldset className="card grid gap-2.5 p-5">
        <legend className="px-1 text-sm font-bold">Operations</legend>
        <Switch
          label="Accept payments"
          description="Turn off to pause all checkout without removing the plans."
          checked={bool(SETTING_KEYS.paymentsEnabled)}
          onChange={(value) => set(SETTING_KEYS.paymentsEnabled, value)}
        />
        <Switch
          label="Allow new registrations"
          description="Turn off to close signups temporarily."
          checked={bool(SETTING_KEYS.registrationEnabled)}
          onChange={(value) => set(SETTING_KEYS.registrationEnabled, value)}
        />
        <Switch
          label="Require email verification"
          description="Gate limited features until the address is confirmed."
          checked={bool(SETTING_KEYS.requireEmailVerification)}
          onChange={(value) => set(SETTING_KEYS.requireEmailVerification, value)}
        />
        <Switch
          label="First-party analytics"
          description="Anonymous, aggregated counts only. No third-party trackers either way."
          checked={bool(SETTING_KEYS.analyticsEnabled)}
          onChange={(value) => set(SETTING_KEYS.analyticsEnabled, value)}
        />
        <Switch
          label="Show ads to free users"
          description="Premium members never see ads regardless of this setting."
          checked={bool(SETTING_KEYS.adsEnabled)}
          onChange={(value) => set(SETTING_KEYS.adsEnabled, value)}
        />
        <Switch
          label="Maintenance mode"
          description="Shows a maintenance notice to visitors. Admins retain access."
          checked={bool(SETTING_KEYS.maintenanceMode)}
          onChange={(value) => set(SETTING_KEYS.maintenanceMode, value)}
        />
      </fieldset>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-subtle)] bg-[var(--surface-raised)]/95 p-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <p className="flex items-center gap-2 text-xs text-body">
            {dirty ? (
              <>
                <AlertIcon size={15} className="text-marigold-500" />
                You have unsaved changes
              </>
            ) : (
              <>
                <InfoIcon size={15} />
                All changes saved
              </>
            )}
          </p>
          <Button onClick={save} loading={saving} disabled={!dirty}>
            Save settings
          </Button>
        </div>
      </div>
    </div>
  );
}
