import { migrate } from 'drizzle-orm/libsql/migrator';
import { sql } from 'drizzle-orm';

import { getDb } from '@/db';
import {
  categories,
  entitlements,
  favorites,
  generatedPrompts,
  likes,
  plans,
  promptCopies,
  prompts,
  roles,
  subscriptions,
  users,
} from '@/db/schema';
import { newId } from '@/lib/id';
import { nowSec } from '@/lib/dates';
import { createPrompt } from '@/services/prompts';
import { createUser } from '@/services/auth';
import { upsertPlan } from '@/services/plans';
import { setSettings } from '@/services/settings';
import { SETTING_KEYS } from '@/lib/constants';

/**
 * Shared fixtures.
 *
 * `resetDatabase()` applies migrations once, then truncates between test files
 * so each suite starts from a known-empty state.
 */

let migrated = false;

export async function resetDatabase(): Promise<void> {
  const db = getDb();

  if (!migrated) {
    await migrate(db, { migrationsFolder: './src/db/migrations' });
    migrated = true;
  }

  // Order matters only loosely because foreign keys are not enforced by default
  // in libSQL, but deleting children first keeps intent clear.
  const tables = [
    'coupon_redemptions',
    'coupons',
    'transactions',
    'payment_events',
    'payments',
    'entitlements',
    'subscriptions',
    'plans',
    'generated_prompts',
    'prompt_copies',
    'prompt_views',
    'favorites',
    'likes',
    'prompt_tags',
    'prompt_images',
    'prompts',
    'tags',
    'categories',
    'articles',
    'comments',
    'reports',
    'contact_messages',
    'notifications',
    'notification_preferences',
    'admin_logs',
    'analytics_events',
    'search_queries',
    'page_views',
    'auth_tokens',
    'sessions',
    'user_roles',
    'profiles',
    'users',
    'roles',
    'site_settings',
    'rate_limit_buckets',
  ];

  for (const table of tables) {
    await db.run(sql.raw(`delete from ${table}`));
  }

  const { invalidateSettingsCache } = await import('@/services/settings');
  invalidateSettingsCache();
}

export async function seedRoles(): Promise<void> {
  const db = getDb();
  for (const name of ['admin', 'editor', 'creator', 'user']) {
    await db.insert(roles).values({ id: newId(), name }).onConflictDoNothing();
  }
}

export async function seedTestPlans(): Promise<void> {
  await upsertPlan({
    code: 'free',
    name: 'Free',
    priceMinor: 0,
    currency: 'INR',
    billingPeriod: 'none',
    intervalCount: 1,
    trialDays: 0,
    features: ['Browse prompts'],
    limits: { copiesPerDay: 3, favorites: 2, generatorPerDay: 2 },
    isActive: true,
    isPopular: false,
    sortOrder: 0,
  });

  await upsertPlan({
    code: 'monthly',
    name: 'Monthly',
    priceMinor: 9_900,
    currency: 'INR',
    billingPeriod: 'month',
    intervalCount: 1,
    trialDays: 0,
    features: ['Unlimited copies'],
    limits: { copiesPerDay: -1, favorites: -1, generatorPerDay: -1 },
    isActive: true,
    isPopular: true,
    sortOrder: 1,
  });

  await upsertPlan({
    code: 'lifetime',
    name: 'Lifetime',
    priceMinor: 199_900,
    currency: 'INR',
    billingPeriod: 'lifetime',
    intervalCount: 1,
    trialDays: 0,
    features: ['Everything, forever'],
    limits: { copiesPerDay: -1, favorites: -1, generatorPerDay: -1 },
    isActive: true,
    isPopular: false,
    sortOrder: 2,
  });
}

/** Applies small free-tier limits so quota tests are fast and explicit. */
export async function setTestLimits(
  overrides: Partial<{
    freeCopies: number;
    freeFavorites: number;
    freeGenerator: number;
    anonCopies: number;
    anonGenerator: number;
  }> = {},
): Promise<void> {
  await setSettings({
    [SETTING_KEYS.freeCopiesPerDay]: overrides.freeCopies ?? 3,
    [SETTING_KEYS.freeFavorites]: overrides.freeFavorites ?? 2,
    [SETTING_KEYS.freeGeneratorPerDay]: overrides.freeGenerator ?? 2,
    [SETTING_KEYS.anonCopiesPerDay]: overrides.anonCopies ?? 1,
    [SETTING_KEYS.anonGeneratorPerDay]: overrides.anonGenerator ?? 1,
  });
}

let userCounter = 0;

export async function createTestUser(
  overrides: Partial<{ email: string; name: string; password: string; roleNames: string[] }> = {},
) {
  await seedRoles();
  // A counter, not a timestamp — several users are often created in the same ms.
  userCounter += 1;
  return createUser({
    name: overrides.name ?? 'Test Member',
    email: overrides.email ?? `member-${userCounter}-${newId().slice(-6).toLowerCase()}@example.com`,
    password: overrides.password ?? 'CorrectHorse7!',
    roleNames: overrides.roleNames ?? ['user'],
    emailVerified: true,
  });
}

export async function createTestCategory(name = 'Portrait'): Promise<string> {
  const id = newId();
  await getDb()
    .insert(categories)
    .values({
      id,
      name,
      slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${id.slice(0, 5).toLowerCase()}`,
      isActive: true,
    });
  return id;
}

export async function createTestPrompt(options: {
  categoryId: string;
  authorId: string;
  title?: string;
  isPremium?: boolean;
  isPublished?: boolean;
  promptText?: string;
}) {
  return createPrompt(
    {
      title: options.title ?? `Test prompt ${newId().slice(0, 6)}`,
      shortDescription: 'A test prompt used by the automated suite.',
      promptText: options.promptText ?? 'A calm portrait in soft window light, 85mm, f/1.8.',
      aiModel: 'gemini',
      categoryId: options.categoryId,
      difficulty: 'beginner',
      tags: ['portrait', 'test'],
      isPremium: options.isPremium ?? false,
      isFeatured: false,
      isTrending: false,
      isEditorsPick: false,
      isPublished: options.isPublished ?? true,
      exampleImages: [],
    },
    options.authorId,
  );
}

/** Grants premium by creating a real, date-bounded subscription. */
export async function grantTestPremium(userId: string, planCode = 'monthly'): Promise<string> {
  const db = getDb();
  const planRows = await db.select().from(plans).where(sql`${plans.code} = ${planCode}`).limit(1);
  const plan = planRows[0];
  if (!plan) throw new Error(`Test plan "${planCode}" not found — call seedTestPlans() first`);

  const subscriptionId = newId();
  await db.insert(subscriptions).values({
    id: subscriptionId,
    userId,
    planId: plan.id,
    provider: 'manual',
    status: 'active',
    startDate: nowSec(),
    endDate: nowSec() + 30 * 86_400,
    autoRenew: false,
  });

  const { activatePremium } = await import('@/services/entitlements');
  await activatePremium({ userId, subscriptionId, expiresAt: nowSec() + 30 * 86_400 });

  return subscriptionId;
}

export async function countRows(table: string): Promise<number> {
  const result = await getDb().get<{ count: number }>(
    sql.raw(`select count(*) as count from ${table}`),
  );
  return Number(result?.count ?? 0);
}

export const TEST_TABLES = {
  users,
  prompts,
  likes,
  favorites,
  promptCopies,
  generatedPrompts,
  entitlements,
  subscriptions,
};
