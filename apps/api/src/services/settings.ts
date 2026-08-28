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
