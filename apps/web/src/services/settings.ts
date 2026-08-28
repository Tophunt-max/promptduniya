import { apiRequest } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import { AppError } from '@/lib/api';
import { SETTING_KEYS } from '@/lib/constants';
import { publicEnv } from '@/lib/env-public';

/**
 * Runtime configuration, owned by the API.
 *
 * Public branding is cached at the edge for a minute — it changes rarely and is
 * read on every page render. The full settings map is admin-only.
 */

export type SettingValue = string | number | boolean;

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

const FALLBACK_BRAND: BrandConfig = {
  name: publicEnv.siteName,
  tagline: publicEnv.tagline,
  domain: 'promptduniya.in',
  logoUrl: '',
  faviconUrl: '/favicon.svg',
  siteUrl: publicEnv.siteUrl,
  contactEmail: '',
  social: { instagram: '', x: '', youtube: '', telegram: '' },
};

interface BrandResponse {
  brand: BrandConfig;
  settings: Record<string, SettingValue>;
}

/**
 * Site identity for layout and metadata. Never throws: a settings outage must
 * not take the whole site down, so the build-time defaults are used instead.
 */
export async function getBrand(): Promise<BrandConfig> {
  try {
    const data = await apiRequest<BrandResponse>('/v1/catalog/brand', { revalidate: 60 });
    // The canonical site URL is owned by the website's own config.
    return { ...data.brand, siteUrl: publicEnv.siteUrl };
  } catch (error) {
    console.error('[settings] brand lookup failed:', error);
    return FALLBACK_BRAND;
  }
}

export async function getPublicSettings(): Promise<Record<string, SettingValue>> {
  try {
    const data = await apiRequest<BrandResponse>('/v1/catalog/brand', { revalidate: 60 });
    return data.settings;
  } catch {
    return {};
  }
}

/** Full settings map — admin only. */
export async function getSettings(): Promise<Record<string, SettingValue>> {
  const token = await getAccessToken();
  if (!token) throw AppError.unauthorized();
  return apiRequest<Record<string, SettingValue>>('/v1/admin/settings', { token });
}

export async function setSettings(
  values: Record<string, SettingValue>,
  _updatedBy?: string,
): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw AppError.unauthorized();
  await apiRequest('/v1/admin/settings', { method: 'PUT', token, body: values });
}

/* ------------------------------ Capabilities ------------------------------ */

export interface Capabilities {
  payments: 'razorpay' | 'mock';
  ai: 'configured' | 'template';
  storage: 'r2';
  email: string;
  /** Publishable gateway key, empty while the mock provider is active. */
  razorpayKeyId: string;
}

const FALLBACK_CAPABILITIES: Capabilities = {
  payments: 'mock',
  ai: 'template',
  storage: 'r2',
  email: 'console',
  razorpayKeyId: '',
};

/**
 * Which integrations the API has live.
 *
 * The website cannot see the API's secrets, so it asks. Used for status badges
 * and to decide whether to open the real gateway widget — never for
 * authorisation, which the API always re-checks.
 */
export async function getCapabilities(): Promise<Capabilities> {
  try {
    const data = await apiRequest<{ capabilities: Capabilities }>('/v1/catalog/brand', {
      revalidate: 60,
    });
    return data.capabilities ?? FALLBACK_CAPABILITIES;
  } catch {
    return FALLBACK_CAPABILITIES;
  }
}

export async function razorpayConfigured(): Promise<boolean> {
  return (await getCapabilities()).payments === 'razorpay';
}

export async function aiConfigured(): Promise<boolean> {
  return (await getCapabilities()).ai === 'configured';
}

/* ------------------------- Convenience accessors -------------------------- */

async function publicSetting<T extends SettingValue>(key: string, fallback: T): Promise<T> {
  const settings = await getPublicSettings();
  const value = settings[key];
  return (value === undefined ? fallback : (value as T));
}

export async function getBoolSetting(key: string, fallback: boolean): Promise<boolean> {
  const value = await publicSetting<SettingValue>(key, fallback);
  return typeof value === 'boolean' ? value : value === 'true';
}

export async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const value = await publicSetting<SettingValue>(key, fallback);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getStringSetting(key: string, fallback = ''): Promise<string> {
  return String(await publicSetting<SettingValue>(key, fallback));
}

/** Retained for signature compatibility; caching now lives at the edge. */
export function invalidateSettingsCache(): void {}

export { SETTING_KEYS };
