import { db, siteSettings } from '@pd/db';
import { SETTING_KEYS } from '@pd/shared';
import { eq } from 'drizzle-orm';

/**
 * Runtime configuration.
 *
 * Reads from the D1 `site_settings` table with the defaults below as a
 * fallback. Nothing user-facing (limits, prices, branding) is hard-coded.
 */

export type SettingValue = string | number | boolean;

export const SETTING_DEFAULTS: Record<string, SettingValue> = {
  [SETTING_KEYS.siteName]: 'promptduniya',
  [SETTING_KEYS.siteTagline]: 'Create Better. Imagine More.',
  [SETTING_KEYS.anonCopiesPerDay]: 3,
  [SETTING_KEYS.anonGeneratorPerDay]: 3,
  [SETTING_KEYS.freeCopiesPerDay]: 10,
  [SETTING_KEYS.freeFavorites]: 25,
  [SETTING_KEYS.freeGeneratorPerDay]: 10,
  [SETTING_KEYS.premiumCopiesPerDay]: -1,
  [SETTING_KEYS.premiumFavorites]: -1,
  [SETTING_KEYS.premiumGeneratorPerDay]: -1,
  [SETTING_KEYS.currency]: 'INR',
  [SETTING_KEYS.paymentsEnabled]: true,
  [SETTING_KEYS.registrationEnabled]: true,
  [SETTING_KEYS.requireEmailVerification]: false,
  [SETTING_KEYS.adsEnabled]: false,
  [SETTING_KEYS.analyticsEnabled]: true,
};

function decode(value: string, valueType: string): SettingValue {
  if (valueType === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (valueType === 'boolean') return value === 'true' || value === '1';
  return value;
}

/** Loads all settings, applying defaults for anything unset. */
export async function getSettings(): Promise<Record<string, SettingValue>> {
  const values: Record<string, SettingValue> = { ...SETTING_DEFAULTS };
  try {
    const rows = await db
      .select({ key: siteSettings.key, value: siteSettings.value, valueType: siteSettings.valueType })
      .from(siteSettings);
    for (const row of rows) values[row.key] = decode(row.value, row.valueType);
  } catch {
    // Table not migrated yet — defaults are correct.
  }
  return values;
}

export async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const all = await getSettings();
  const value = all[key];
  return typeof value === 'number' ? value : Number(value ?? fallback);
}

export async function getBoolSetting(key: string, fallback: boolean): Promise<boolean> {
  const all = await getSettings();
  const value = all[key];
  if (value === undefined) return fallback;
  return typeof value === 'boolean' ? value : value === 'true';
}

function encode(value: SettingValue): { value: string; valueType: string } {
  if (typeof value === 'number') return { value: String(value), valueType: 'number' };
  if (typeof value === 'boolean') return { value: value ? 'true' : 'false', valueType: 'boolean' };
  return { value, valueType: 'string' };
}

export async function setSettings(
  values: Record<string, SettingValue>,
  updatedBy?: string,
): Promise<void> {
  const { nowSec } = await import('../lib/dates');
  for (const [key, raw] of Object.entries(values)) {
    const { value, valueType } = encode(raw);
    await db
      .insert(siteSettings)
      .values({
        key,
        value,
        valueType,
        group: key.split('.')[0] ?? 'general',
        updatedBy: updatedBy ?? null,
        updatedAt: nowSec(),
      })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value, valueType, updatedBy: updatedBy ?? null, updatedAt: nowSec() },
      });
  }
}


/* ============================== Branding =============================== */

export interface BrandConfig {
  name: string;
  tagline: string;
  domain: string;
  logoUrl: string;
  faviconUrl: string;
  siteUrl: string;
  contactEmail: string;
  social: { instagram: string; x: string; youtube: string; telegram: string };
}

/**
 * Site identity, resolved from settings with sensible defaults.
 *
 * `siteUrl` comes from the configured web origin rather than a setting, so the
 * canonical host can never be edited into something broken from the admin UI.
 */
export async function getBrand(): Promise<BrandConfig> {
  const { config } = await import('../lib/env');
  const s = await getSettings();
  const str = (key: string, fallback: string) => String(s[key] ?? fallback);

  return {
    name: str(SETTING_KEYS.siteName, 'promptduniya'),
    tagline: str(SETTING_KEYS.siteTagline, 'Create Better. Imagine More.'),
    domain: str(SETTING_KEYS.siteDomain, 'promptduniya.in'),
    logoUrl: str(SETTING_KEYS.siteLogoUrl, ''),
    faviconUrl: str(SETTING_KEYS.siteFaviconUrl, '/favicon.svg'),
    siteUrl: config().webOrigin,
    contactEmail: str(SETTING_KEYS.contactEmail, ''),
    social: {
      instagram: str(SETTING_KEYS.socialInstagram, ''),
      x: str(SETTING_KEYS.socialX, ''),
      youtube: str(SETTING_KEYS.socialYoutube, ''),
      telegram: str(SETTING_KEYS.socialTelegram, ''),
    },
  };
}

/** Only the settings flagged public — safe to expose to any caller. */
export async function getPublicSettings(): Promise<Record<string, SettingValue>> {
  const values: Record<string, SettingValue> = {};
  try {
    const rows = await db
      .select({
        key: siteSettings.key,
        value: siteSettings.value,
        valueType: siteSettings.valueType,
        isPublic: siteSettings.isPublic,
      })
      .from(siteSettings)
      .where(eq(siteSettings.isPublic, true));
    for (const row of rows) values[row.key] = decode(row.value, row.valueType);
  } catch {
    // Table not migrated yet — an empty map is the correct answer.
  }
  return values;
}
