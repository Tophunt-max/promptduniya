import { eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { siteSettings } from '@/db/schema';
import { nowSec } from '@/lib/dates';
import { publicEnv } from '@/lib/env';
import { SETTING_KEYS } from '@/lib/constants';
import { parseJson } from '@/lib/utils';

/**
 * Runtime configuration store.
 *
 * Nothing user-facing is hard-coded: limits, prices, branding and toggles are
 * all read from `site_settings` with the defaults below as a fallback so a
 * fresh install works before anything is seeded.
 */

export type SettingValue = string | number | boolean;

export const SETTING_DEFAULTS: Record<string, SettingValue> = {
  [SETTING_KEYS.siteName]: publicEnv.siteName,
  [SETTING_KEYS.siteTagline]: publicEnv.tagline,
  [SETTING_KEYS.siteDomain]: 'promptduniya.in',
  [SETTING_KEYS.siteLogoUrl]: '',
  [SETTING_KEYS.siteFaviconUrl]: '/favicon.svg',
  [SETTING_KEYS.seoTitleTemplate]: '%s · promptduniya',
  [SETTING_KEYS.seoDefaultDescription]:
    'Discover trending AI image prompts made for Indian creators, generate your own prompts in seconds, and turn ideas into stunning visuals.',
  [SETTING_KEYS.seoDefaultKeywords]:
    'ai image prompts, gemini prompts, indian ai photo prompts, prompt generator, midjourney prompts',
  [SETTING_KEYS.socialInstagram]: '',
  [SETTING_KEYS.socialX]: '',
  [SETTING_KEYS.socialYoutube]: '',
  [SETTING_KEYS.socialTelegram]: '',
  [SETTING_KEYS.contactEmail]: 'hello@promptduniya.in',
  [SETTING_KEYS.contactPhone]: '',
  [SETTING_KEYS.contactAddress]: 'India',

  // Limits — -1 means unlimited. Editable from /admin/settings.
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
  [SETTING_KEYS.maintenanceMode]: false,
  [SETTING_KEYS.adsEnabled]: false,
  [SETTING_KEYS.analyticsEnabled]: true,
  [SETTING_KEYS.registrationEnabled]: true,
  [SETTING_KEYS.requireEmailVerification]: false,
};

const PUBLIC_KEYS = new Set<string>([
  SETTING_KEYS.siteName,
  SETTING_KEYS.siteTagline,
  SETTING_KEYS.siteDomain,
  SETTING_KEYS.siteLogoUrl,
  SETTING_KEYS.siteFaviconUrl,
  SETTING_KEYS.seoTitleTemplate,
  SETTING_KEYS.seoDefaultDescription,
  SETTING_KEYS.seoDefaultKeywords,
  SETTING_KEYS.socialInstagram,
  SETTING_KEYS.socialX,
  SETTING_KEYS.socialYoutube,
  SETTING_KEYS.socialTelegram,
  SETTING_KEYS.contactEmail,
  SETTING_KEYS.contactPhone,
  SETTING_KEYS.contactAddress,
  SETTING_KEYS.freeCopiesPerDay,
  SETTING_KEYS.freeFavorites,
  SETTING_KEYS.freeGeneratorPerDay,
  SETTING_KEYS.adsEnabled,
  SETTING_KEYS.registrationEnabled,
]);

interface CacheEntry {
  values: Record<string, SettingValue>;
  expiresAt: number;
}

const globalForSettings = globalThis as unknown as { __pdSettings?: CacheEntry };
const CACHE_TTL_SEC = 30;

function decode(value: string, valueType: string): SettingValue {
  switch (valueType) {
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }
    case 'boolean':
      return value === 'true' || value === '1';
    case 'json':
      return value;
    default:
      return value;
  }
}

function encode(value: SettingValue): { value: string; valueType: string } {
  if (typeof value === 'number') return { value: String(value), valueType: 'number' };
  if (typeof value === 'boolean') return { value: value ? 'true' : 'false', valueType: 'boolean' };
  return { value, valueType: 'string' };
}

async function loadAll(): Promise<Record<string, SettingValue>> {
  const cached = globalForSettings.__pdSettings;
  if (cached && cached.expiresAt > nowSec()) return cached.values;

  const values: Record<string, SettingValue> = { ...SETTING_DEFAULTS };
  try {
    const rows = await db
      .select({ key: siteSettings.key, value: siteSettings.value, valueType: siteSettings.valueType })
      .from(siteSettings);
    for (const row of rows) values[row.key] = decode(row.value, row.valueType);
  } catch {
    // Table may not exist yet (before the first migration) — defaults are fine.
  }

  globalForSettings.__pdSettings = { values, expiresAt: nowSec() + CACHE_TTL_SEC };
  return values;
}

export function invalidateSettingsCache() {
  globalForSettings.__pdSettings = undefined;
}

export async function getSettings(): Promise<Record<string, SettingValue>> {
  return loadAll();
}

export async function getSetting<T extends SettingValue>(key: string, fallback: T): Promise<T> {
  const all = await loadAll();
  const value = all[key];
  if (value === undefined) return fallback;
  if (typeof fallback === 'number') return (typeof value === 'number' ? value : Number(value)) as T;
  if (typeof fallback === 'boolean')
    return (typeof value === 'boolean' ? value : value === 'true') as T;
  return String(value) as T;
}

export async function getNumberSetting(key: string, fallback: number): Promise<number> {
  return getSetting(key, fallback);
}

export async function getBoolSetting(key: string, fallback: boolean): Promise<boolean> {
  return getSetting(key, fallback);
}

export async function getStringSetting(key: string, fallback = ''): Promise<string> {
  return getSetting(key, fallback);
}

/** Only keys marked public are ever sent to the browser. */
export async function getPublicSettings(): Promise<Record<string, SettingValue>> {
  const all = await loadAll();
  const out: Record<string, SettingValue> = {};
  for (const key of PUBLIC_KEYS) if (all[key] !== undefined) out[key] = all[key]!;
  return out;
}

export async function setSettings(
  values: Record<string, SettingValue>,
  updatedBy?: string,
): Promise<void> {
  const entries = Object.entries(values);
  if (entries.length === 0) return;

  for (const [key, raw] of entries) {
    const { value, valueType } = encode(raw);
    await db
      .insert(siteSettings)
      .values({
        key,
        value,
        valueType,
        group: key.split('.')[0] ?? 'general',
        isPublic: PUBLIC_KEYS.has(key),
        updatedBy: updatedBy ?? null,
        updatedAt: nowSec(),
      })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value, valueType, updatedBy: updatedBy ?? null, updatedAt: nowSec() },
      });
  }

  invalidateSettingsCache();
}

export async function deleteSetting(key: string): Promise<void> {
  await db.delete(siteSettings).where(eq(siteSettings.key, key));
  invalidateSettingsCache();
}

export async function getSettingsByKeys(keys: string[]): Promise<Record<string, SettingValue>> {
  if (keys.length === 0) return {};
  const rows = await db
    .select({ key: siteSettings.key, value: siteSettings.value, valueType: siteSettings.valueType })
    .from(siteSettings)
    .where(inArray(siteSettings.key, keys));
  const out: Record<string, SettingValue> = {};
  for (const key of keys) if (SETTING_DEFAULTS[key] !== undefined) out[key] = SETTING_DEFAULTS[key]!;
  for (const row of rows) out[row.key] = decode(row.value, row.valueType);
  return out;
}

/** Branding used by layouts, metadata and emails. */
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

export async function getBrand(): Promise<BrandConfig> {
  const s = await loadAll();
  return {
    name: String(s[SETTING_KEYS.siteName] ?? publicEnv.siteName),
    tagline: String(s[SETTING_KEYS.siteTagline] ?? publicEnv.tagline),
    domain: String(s[SETTING_KEYS.siteDomain] ?? 'promptduniya.in'),
    logoUrl: String(s[SETTING_KEYS.siteLogoUrl] ?? ''),
    faviconUrl: String(s[SETTING_KEYS.siteFaviconUrl] ?? '/favicon.svg'),
    siteUrl: publicEnv.siteUrl,
    contactEmail: String(s[SETTING_KEYS.contactEmail] ?? ''),
    social: {
      instagram: String(s[SETTING_KEYS.socialInstagram] ?? ''),
      x: String(s[SETTING_KEYS.socialX] ?? ''),
      youtube: String(s[SETTING_KEYS.socialYoutube] ?? ''),
      telegram: String(s[SETTING_KEYS.socialTelegram] ?? ''),
    },
  };
}

export function parseJsonSetting<T>(raw: SettingValue | undefined, fallback: T): T {
  return parseJson(typeof raw === 'string' ? raw : null, fallback);
}
