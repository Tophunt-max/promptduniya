import { AUTOMATION_SETTING_KEYS } from '@pd/shared';

import { getSettings, setSettings, type SettingValue } from '../settings';

/**
 * Automation configuration.
 *
 * Stored in `site_settings` rather than in environment variables or a dedicated
 * table. Environment variables would need a redeploy to change the posting rate,
 * which defeats the point of an automation console; a dedicated table would
 * duplicate machinery that already exists and already has an admin screen.
 * `covers.ts` set the precedent by keeping its house-model references there.
 *
 * The scheduling model deserves an explanation, because it is not the obvious
 * one. Cloudflare cron expressions live in `wrangler.jsonc` and cannot be edited
 * at runtime, so "generate at 09:00, 13:00, 18:00 and 21:00, configurable"
 * cannot be expressed as four cron triggers. Instead the Worker ticks every hour
 * and `publishHours` decides which ticks do work. Changing the schedule is then
 * a settings write, and the cron expression never changes.
 *
 * `postsPerDay` is a cap rather than a target for the same reason: a tick that
 * finds the day's quota already met does nothing, so an operator lowering the
 * number mid-day takes effect immediately instead of at midnight.
 */

export interface AutomationConfig {
  enabled: boolean;
  postsPerDay: number;
  /** Hours (0-23) in the configured timezone at which a tick should generate. */
  publishHours: number[];
  /** Minutes east of UTC. 330 = IST, the platform's home timezone. */
  timezoneOffsetMinutes: number;
  publishMode: 'draft' | 'publish' | 'schedule';
  autoPublish: boolean;
  minQualityScore: number;
  duplicateThreshold: number;
  autoImages: boolean;
  autoSeo: boolean;
  autoCategory: boolean;
  autoTags: boolean;
  duplicateDetection: boolean;
  trendDiscovery: boolean;
  maxPerRun: number;
  runBudgetSeconds: number;
  maxAttempts: number;
  premiumRatio: number;
  photoEditRatio: number;
  defaultAiModel: string;
  logRetentionDays: number;
}

const K = AUTOMATION_SETTING_KEYS;

/**
 * Defaults chosen to be safe on a fresh deployment.
 *
 * `enabled` is false and `publishMode` is 'draft', so installing this feature
 * cannot start publishing machine-written posts to a live site before anyone has
 * looked at one. Turning it on is a deliberate act.
 */
export const AUTOMATION_DEFAULTS: AutomationConfig = {
  enabled: false,
  postsPerDay: 8,
  publishHours: [9, 13, 18, 21],
  timezoneOffsetMinutes: 330,
  publishMode: 'draft',
  autoPublish: false,
  // 72 passes a prompt that covers subject, light, camera and wardrobe but has
  // dropped one or two of the softer metadata fields. Below that, something in
  // the draft is usually actually wrong.
  minQualityScore: 72,
  duplicateThreshold: 82,
  autoImages: true,
  autoSeo: true,
  autoCategory: true,
  autoTags: true,
  duplicateDetection: true,
  trendDiscovery: true,
  // Four items is roughly three to four minutes of model time. Beyond that a
  // single tick risks running into the next one.
  maxPerRun: 4,
  runBudgetSeconds: 240,
  maxAttempts: 3,
  premiumRatio: 25,
  photoEditRatio: 35,
  defaultAiModel: 'gemini',
  logRetentionDays: 30,
};

function bool(value: SettingValue | undefined, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return value === 'true' || value === '1';
}

function num(value: SettingValue | undefined, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

/**
 * Parses "9,13,18,21" into [9, 13, 18, 21].
 *
 * Sorted and de-duplicated so the hour comparison in the runner is a simple
 * `includes`, and an operator typing "18, 9, 9" gets what they meant. An empty
 * or unparseable value falls back to the default rather than to an empty list,
 * because an empty list silently disables generation while the console still
 * reads "enabled" — a confusing state to debug.
 */
export function parsePublishHours(raw: SettingValue | undefined, fallback: number[]): number[] {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;

  const hours = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23);

  const unique = [...new Set(hours)].sort((a, b) => a - b);
  return unique.length > 0 ? unique : fallback;
}

export async function getAutomationConfig(): Promise<AutomationConfig> {
  const s = await getSettings();
  const d = AUTOMATION_DEFAULTS;

  const publishMode = String(s[K.publishMode] ?? d.publishMode);

  return {
    enabled: bool(s[K.enabled], d.enabled),
    postsPerDay: num(s[K.postsPerDay], d.postsPerDay, 0, 200),
    publishHours: parsePublishHours(s[K.publishHours], d.publishHours),
    timezoneOffsetMinutes: num(
      s[K.timezoneOffsetMinutes],
      d.timezoneOffsetMinutes,
      -840,
      840,
    ),
    publishMode:
      publishMode === 'publish' || publishMode === 'schedule' || publishMode === 'draft'
        ? publishMode
        : d.publishMode,
    autoPublish: bool(s[K.autoPublish], d.autoPublish),
    minQualityScore: num(s[K.minQualityScore], d.minQualityScore, 0, 100),
    duplicateThreshold: num(s[K.duplicateThreshold], d.duplicateThreshold, 50, 100),
    autoImages: bool(s[K.autoImages], d.autoImages),
    autoSeo: bool(s[K.autoSeo], d.autoSeo),
    autoCategory: bool(s[K.autoCategory], d.autoCategory),
    autoTags: bool(s[K.autoTags], d.autoTags),
    duplicateDetection: bool(s[K.duplicateDetection], d.duplicateDetection),
    trendDiscovery: bool(s[K.trendDiscovery], d.trendDiscovery),
    maxPerRun: num(s[K.maxPerRun], d.maxPerRun, 1, 50),
    runBudgetSeconds: num(s[K.runBudgetSeconds], d.runBudgetSeconds, 10, 600),
    maxAttempts: num(s[K.maxAttempts], d.maxAttempts, 1, 10),
    premiumRatio: num(s[K.premiumRatio], d.premiumRatio, 0, 100),
    photoEditRatio: num(s[K.photoEditRatio], d.photoEditRatio, 0, 100),
    defaultAiModel: String(s[K.defaultAiModel] ?? d.defaultAiModel),
    logRetentionDays: num(s[K.logRetentionDays], d.logRetentionDays, 1, 365),
  };
}

/**
 * Writes only the keys present in `patch`.
 *
 * A partial write matters here: the automation screen has more than twenty
 * controls across several cards, and sending the whole object on every toggle
 * would let a stale tab overwrite a change made in another one.
 */
export async function setAutomationConfig(
  patch: Partial<Record<keyof AutomationConfig, unknown>>,
  updatedBy?: string,
): Promise<AutomationConfig> {
  const values: Record<string, SettingValue> = {};

  const put = (key: string, value: unknown) => {
    if (value === undefined) return;
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
      values[key] = value;
    }
  };

  put(K.enabled, patch.enabled);
  put(K.postsPerDay, patch.postsPerDay);
  put(K.timezoneOffsetMinutes, patch.timezoneOffsetMinutes);
  put(K.publishMode, patch.publishMode);
  put(K.autoPublish, patch.autoPublish);
  put(K.minQualityScore, patch.minQualityScore);
  put(K.duplicateThreshold, patch.duplicateThreshold);
  put(K.autoImages, patch.autoImages);
  put(K.autoSeo, patch.autoSeo);
  put(K.autoCategory, patch.autoCategory);
  put(K.autoTags, patch.autoTags);
  put(K.duplicateDetection, patch.duplicateDetection);
  put(K.trendDiscovery, patch.trendDiscovery);
  put(K.maxPerRun, patch.maxPerRun);
  put(K.runBudgetSeconds, patch.runBudgetSeconds);
  put(K.maxAttempts, patch.maxAttempts);
  put(K.premiumRatio, patch.premiumRatio);
  put(K.photoEditRatio, patch.photoEditRatio);
  put(K.defaultAiModel, patch.defaultAiModel);
  put(K.logRetentionDays, patch.logRetentionDays);

  // Stored as the operator's own comma-separated string so the console can round
  // trip exactly what was typed, but normalised first so a malformed entry never
  // reaches the database.
  if (patch.publishHours !== undefined) {
    const hours = Array.isArray(patch.publishHours)
      ? patch.publishHours
      : parsePublishHours(String(patch.publishHours), AUTOMATION_DEFAULTS.publishHours);
    const normalised = parsePublishHours(hours.join(','), AUTOMATION_DEFAULTS.publishHours);
    values[K.publishHours] = normalised.join(',');
  }

  if (Object.keys(values).length > 0) await setSettings(values, updatedBy);
  return getAutomationConfig();
}

/**
 * The hour of day at the configured offset.
 *
 * Kept here rather than in `lib/dates.ts` because `dayBucket` there hardcodes
 * IST, whereas automation has to honour whatever the operator configured.
 */
export function localHour(seconds: number, offsetMinutes: number): number {
  return new Date((seconds + offsetMinutes * 60) * 1000).getUTCHours();
}

/** Day key at the configured offset, used to count a day's output so far. */
export function localDayBucket(seconds: number, offsetMinutes: number): string {
  return new Date((seconds + offsetMinutes * 60) * 1000).toISOString().slice(0, 10);
}

/**
 * How many posts this tick should try to produce.
 *
 * Spreads `postsPerDay` across the configured slots rather than generating the
 * whole day's quota in the first one, so the site gains posts through the day and
 * a provider outage at 09:00 does not cost the entire day's output.
 */
export function slotAllowance(config: AutomationConfig): number {
  const slots = Math.max(1, config.publishHours.length);
  return Math.max(1, Math.ceil(config.postsPerDay / slots));
}
