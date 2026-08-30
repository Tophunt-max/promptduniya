/**
 * Generates an idempotent `seed/seed.sql` for D1 from the TypeScript seed data.
 *
 * D1 has no "run a Node script against the database" story — the supported path
 * is `wrangler d1 execute --file=<sql>`. So the catalogue is compiled to SQL
 * here, in plain Node, and applied by wrangler locally or remotely.
 *
 * Two properties make re-running safe:
 *   1. Every id is derived from a stable natural key (slug, code, email) via
 *      SHA-256, so regenerating produces byte-identical ids.
 *   2. Every statement is an upsert. Content rows are refreshed; rows an
 *      operator may have edited (site settings, user passwords) use DO NOTHING.
 *
 *   npm run db:seed:generate
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';

import { SETTING_KEYS, slugify } from '@pd/shared';
import { SEED_ARTICLES } from './seed/articles';
import { SEED_CATEGORIES, SEED_PLANS, SEED_TAGS } from './seed/catalog';
import { EXTRA_PROMPTS } from './seed/prompts-extra';
import { FREE_PROMPTS } from './seed/prompts-free';
import { GEMINI_EDIT_PROMPTS } from './seed/prompts-gemini-edit';
import { PREMIUM_PROMPTS } from './seed/prompts-premium';
import type { SeedPrompt } from './seed/prompt-types';

/* ----------------------------- SQL primitives ----------------------------- */

/** Single-quoted SQL string literal with quotes escaped. */
function str(value: string | null | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

function bool(value: boolean | undefined): string {
  return value ? '1' : '0';
}

function num(value: number | null | undefined): string {
  return value === null || value === undefined ? 'NULL' : String(value);
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Deterministic 26-character id in the same alphabet as the runtime ULIDs.
 * Same input always yields the same id, which is what makes the seed idempotent.
 */
function seedId(namespace: string, key: string): string {
  const digest = createHash('sha256').update(`${namespace}:${key}`).digest();
  let out = '';
  for (let i = 0; i < 26; i++) out += CROCKFORD[digest[i]! % 32];
  return out;
}

/* -------------------------------- Defaults -------------------------------- */

const NOW = Math.floor(Date.now() / 1000);

/** Mirrors SETTING_DEFAULTS in apps/api/src/services/settings.ts. */
const SETTING_DEFAULTS: Record<string, string | number | boolean> = {
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

const ROLES = [
  { name: 'admin', description: 'Full access to the admin panel and all settings' },
  { name: 'editor', description: 'Can manage prompts, categories and articles' },
  { name: 'creator', description: 'Can submit prompts for review' },
  { name: 'user', description: 'Standard member account' },
];

/** Feature keys granted with a paid plan. Mirrors PREMIUM_FEATURES in the API. */
const PREMIUM_FEATURES = [
  'premium_prompts',
  'unlimited_copies',
  'unlimited_favorites',
  'advanced_generator',
  'ad_free',
  'premium_collections',
  'hd_assets',
  'priority_support',
];

/* --------------------------------- Builder -------------------------------- */

const lines: string[] = [];

function section(title: string) {
  lines.push('', `-- ${'='.repeat(72)}`, `-- ${title}`, `-- ${'='.repeat(72)}`);
}

function emit(sql: string) {
  lines.push(`${sql};`);
}

function settingValueType(value: string | number | boolean): string {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

function settingValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/** Denormalised lowercase haystack — must match buildSearchText in the API. */
function buildSearchText(prompt: SeedPrompt): string {
  return [prompt.title, prompt.shortDescription, prompt.promptText, prompt.tags.join(' ')]
    .join(' ')
    .toLowerCase()
    .slice(0, 4000);
}

function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@promptduniya.in';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!Admin123';
  const adminName = process.env.SEED_ADMIN_NAME ?? 'Duniya Admin';
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? 'ChangeMe!Demo123';

  // 10 rounds matches the API's AUTH_BCRYPT_ROUNDS default.
  const adminHash = bcrypt.hashSync(adminPassword, 10);
  const demoHash = bcrypt.hashSync(demoPassword, 10);

  lines.push(
    '-- promptduniya seed data — GENERATED FILE, DO NOT EDIT BY HAND.',
    '-- Regenerate with: npm run db:seed:generate',
    '--',
    '-- Idempotent: every statement is an upsert keyed on a natural key, so',
    '-- applying this file repeatedly converges rather than duplicating.',
    '-- Apply with:',
    '--   npm run db:seed:local     (local miniflare D1)',
    '--   npm run db:seed:remote    (production D1)',
  );

  /* ------------------------------- Roles -------------------------------- */
  section('Roles');
  for (const role of ROLES) {
    emit(
      `INSERT INTO roles (id, name, description) VALUES (${str(seedId('role', role.name))}, ${str(role.name)}, ${str(role.description)})
  ON CONFLICT(name) DO UPDATE SET description = excluded.description`,
    );
  }

  /* ----------------------------- Settings ------------------------------- */
  section('Site settings (DO NOTHING — never clobber an operator’s edits)');
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    emit(
      `INSERT INTO site_settings (key, value, value_type, "group", is_public, updated_at)
  VALUES (${str(key)}, ${str(settingValue(value))}, ${str(settingValueType(value))}, ${str(key.split('.')[0] ?? 'general')}, 1, ${NOW})
  ON CONFLICT(key) DO NOTHING`,
    );
  }

  /* ------------------------------- Plans -------------------------------- */
  section('Plans');
  for (const plan of SEED_PLANS) {
    const id = seedId('plan', plan.code);
    emit(
      `INSERT INTO plans (
    id, code, name, description, price_minor, currency, billing_period, interval_count,
    trial_days, features_json, limits_json, is_active, is_popular, sort_order, created_at, updated_at
  ) VALUES (
    ${str(id)}, ${str(plan.code)}, ${str(plan.name)}, ${str(plan.description)}, ${num(plan.priceMinor)},
    'INR', ${str(plan.billingPeriod)}, 1, 0, ${str(JSON.stringify(plan.features))},
    ${str(JSON.stringify(plan.limits))}, 1, ${bool(plan.isPopular)}, ${num(plan.sortOrder)}, ${NOW}, ${NOW}
  ) ON CONFLICT(code) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    price_minor = excluded.price_minor,
    billing_period = excluded.billing_period,
    features_json = excluded.features_json,
    limits_json = excluded.limits_json,
    is_active = excluded.is_active,
    is_popular = excluded.is_popular,
    sort_order = excluded.sort_order,
    updated_at = ${NOW}`,
    );
  }

  /* ----------------------------- Categories ----------------------------- */
  section('Categories');
  const categoryIds = new Map<string, string>();
  for (const [index, category] of SEED_CATEGORIES.entries()) {
    const id = seedId('category', category.slug);
    categoryIds.set(category.slug, id);
    emit(
      `INSERT INTO categories (
    id, name, slug, description, icon, accent, is_active, is_featured, sort_order,
    seo_title, seo_description, prompt_count, created_at, updated_at
  ) VALUES (
    ${str(id)}, ${str(category.name)}, ${str(category.slug)}, ${str(category.description)},
    ${str(category.icon)}, ${str(category.accent)}, 1, ${bool(category.featured)}, ${index},
    ${str(`${category.name} AI image prompts`)}, ${str(category.description)}, 0, ${NOW}, ${NOW}
  ) ON CONFLICT(slug) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    icon = excluded.icon,
    accent = excluded.accent,
    is_featured = excluded.is_featured,
    sort_order = excluded.sort_order,
    updated_at = ${NOW}`,
    );
  }

  /* -------------------------------- Tags -------------------------------- */
  section('Tags');
  const tagIds = new Map<string, string>();
  const allTagNames = new Set<string>(SEED_TAGS);
  const allPrompts: SeedPrompt[] = [
    ...FREE_PROMPTS,
    ...PREMIUM_PROMPTS,
    ...EXTRA_PROMPTS,
    ...GEMINI_EDIT_PROMPTS,
  ];
  // Tags referenced by prompts but missing from SEED_TAGS still need rows.
  for (const prompt of allPrompts) for (const tag of prompt.tags) allTagNames.add(tag);

  for (const name of allTagNames) {
    const slug = slugify(name);
    if (!slug) continue;
    const id = seedId('tag', slug);
    tagIds.set(slug, id);
    emit(
      `INSERT INTO tags (id, name, slug, usage_count, created_at, updated_at)
  VALUES (${str(id)}, ${str(name)}, ${str(slug)}, 0, ${NOW}, ${NOW})
  ON CONFLICT(slug) DO UPDATE SET name = excluded.name`,
    );
  }

  /* -------------------------------- Users ------------------------------- */
  section('Demo accounts (DO NOTHING — a re-seed must not reset passwords)');
  const demoUsers = [
    {
      email: adminEmail,
      name: adminName,
      username: 'admin',
      hash: adminHash,
      roles: ['admin', 'editor', 'user'],
    },
    {
      email: 'editor@promptduniya.in',
      name: 'Demo Editor',
      username: 'editor',
      hash: demoHash,
      roles: ['editor', 'user'],
    },
    {
      email: 'free@promptduniya.in',
      name: 'Free Member',
      username: 'freemember',
      hash: demoHash,
      roles: ['user'],
    },
    {
      email: 'premium@promptduniya.in',
      name: 'Premium Member',
      username: 'premiummember',
      hash: demoHash,
      roles: ['user'],
    },
  ];

  const userIds = new Map<string, string>();
  for (const user of demoUsers) {
    const normalized = user.email.trim().toLowerCase();
    const id = seedId('user', normalized);
    userIds.set(user.email, id);

    emit(
      `INSERT INTO users (
    id, email, email_normalized, email_verified_at, password_hash, name, username,
    status, created_at, updated_at
  ) VALUES (
    ${str(id)}, ${str(user.email)}, ${str(normalized)}, ${NOW}, ${str(user.hash)},
    ${str(user.name)}, ${str(user.username)}, 'active', ${NOW}, ${NOW}
  ) ON CONFLICT(email_normalized) DO NOTHING`,
    );
    emit(
      `INSERT INTO profiles (user_id, created_at, updated_at) VALUES (${str(id)}, ${NOW}, ${NOW})
  ON CONFLICT(user_id) DO NOTHING`,
    );
    emit(
      `INSERT INTO notification_preferences (user_id, created_at, updated_at)
  VALUES (${str(id)}, ${NOW}, ${NOW}) ON CONFLICT(user_id) DO NOTHING`,
    );

    // Role grants are re-applied on every seed so permissions stay correct even
    // if the user row already existed.
    for (const role of user.roles) {
      emit(
        `INSERT INTO user_roles (user_id, role_id, created_at)
  SELECT ${str(id)}, r.id, ${NOW} FROM roles r WHERE r.name = ${str(role)}
  ON CONFLICT(user_id, role_id) DO NOTHING`,
      );
    }
  }

  /* -------------------- Premium demo membership ------------------------- */
  section('Premium membership for premium@promptduniya.in');
  const premiumUserId = userIds.get('premium@promptduniya.in')!;
  const yearlyPlanId = seedId('plan', 'yearly');
  const subscriptionId = seedId('subscription', `${premiumUserId}:yearly`);
  const premiumEnds = NOW + 365 * 86_400;

  emit(
    `INSERT INTO subscriptions (
    id, user_id, plan_id, provider, status, start_date, end_date, auto_renew, created_at, updated_at
  ) VALUES (
    ${str(subscriptionId)}, ${str(premiumUserId)}, ${str(yearlyPlanId)}, 'manual', 'active',
    ${NOW}, ${premiumEnds}, 0, ${NOW}, ${NOW}
  ) ON CONFLICT(id) DO UPDATE SET
    status = 'active',
    start_date = ${NOW},
    end_date = ${premiumEnds},
    updated_at = ${NOW}`,
  );

  for (const feature of PREMIUM_FEATURES) {
    emit(
      `INSERT INTO entitlements (
    id, user_id, subscription_id, feature, quota, source, starts_at, expires_at, created_at, updated_at
  ) VALUES (
    ${str(seedId('entitlement', `${premiumUserId}:${feature}`))}, ${str(premiumUserId)},
    ${str(subscriptionId)}, ${str(feature)}, -1, 'plan', ${NOW}, ${premiumEnds}, ${NOW}, ${NOW}
  ) ON CONFLICT(id) DO UPDATE SET
    expires_at = ${premiumEnds},
    revoked_at = NULL,
    updated_at = ${NOW}`,
    );
  }

  /* ------------------------------- Prompts ------------------------------ */
  section(`Prompts (${allPrompts.length} total)`);
  const authorId = userIds.get(adminEmail)!;
  let skipped = 0;

  for (const prompt of allPrompts) {
    const categoryId = categoryIds.get(prompt.categorySlug);
    if (!categoryId) {
      console.warn(`  ! skipping "${prompt.slug}" — unknown category ${prompt.categorySlug}`);
      skipped += 1;
      continue;
    }

    const id = seedId('prompt', prompt.slug);
    emit(
      `INSERT INTO prompts (
    id, title, slug, short_description, prompt_text, negative_prompt, usage_instructions,
    ai_model, input_mode, category_id, style, gender, age_group, location, aspect_ratio,
    camera_style, lighting, mood, difficulty, is_premium, is_featured, is_trending,
    is_editors_pick, is_published, published_at, author_id, seo_title, seo_description,
    search_text, created_at, updated_at
  ) VALUES (
    ${str(id)}, ${str(prompt.title)}, ${str(prompt.slug)}, ${str(prompt.shortDescription)},
    ${str(prompt.promptText)}, ${str(prompt.negativePrompt)}, ${str(prompt.usageInstructions)},
    ${str(prompt.aiModel)}, ${str(prompt.inputMode ?? 'text-to-image')},
    ${str(categoryId)}, ${str(prompt.style)}, ${str(prompt.gender)},
    ${str(prompt.ageGroup)}, ${str(prompt.location)}, ${str(prompt.aspectRatio)},
    ${str(prompt.cameraStyle)}, ${str(prompt.lighting)}, ${str(prompt.mood)},
    ${str(prompt.difficulty)}, ${bool(prompt.isPremium)}, ${bool(prompt.isFeatured)},
    ${bool(prompt.isTrending)}, ${bool(prompt.isEditorsPick)}, 1, ${NOW}, ${str(authorId)},
    ${str(prompt.seoTitle)}, ${str(prompt.seoDescription)}, ${str(buildSearchText(prompt))},
    ${NOW}, ${NOW}
  ) ON CONFLICT(slug) DO UPDATE SET
    title = excluded.title,
    short_description = excluded.short_description,
    prompt_text = excluded.prompt_text,
    negative_prompt = excluded.negative_prompt,
    usage_instructions = excluded.usage_instructions,
    ai_model = excluded.ai_model,
    input_mode = excluded.input_mode,
    category_id = excluded.category_id,
    style = excluded.style,
    gender = excluded.gender,
    age_group = excluded.age_group,
    location = excluded.location,
    aspect_ratio = excluded.aspect_ratio,
    camera_style = excluded.camera_style,
    lighting = excluded.lighting,
    mood = excluded.mood,
    difficulty = excluded.difficulty,
    is_premium = excluded.is_premium,
    is_featured = excluded.is_featured,
    is_editors_pick = excluded.is_editors_pick,
    seo_title = excluded.seo_title,
    seo_description = excluded.seo_description,
    search_text = excluded.search_text,
    updated_at = ${NOW}`,
    );

    for (const tagName of prompt.tags) {
      const tagSlug = slugify(tagName);
      const tagId = tagIds.get(tagSlug);
      if (!tagId) continue;
      emit(
        `INSERT INTO prompt_tags (prompt_id, tag_id) VALUES (${str(id)}, ${str(tagId)})
  ON CONFLICT(prompt_id, tag_id) DO NOTHING`,
      );
    }
  }

  /* ------------------------------ Articles ------------------------------ */
  section(`Articles (${SEED_ARTICLES.length} total)`);
  for (const article of SEED_ARTICLES) {
    const id = seedId('article', article.slug);
    const categoryId = article.categorySlug ? categoryIds.get(article.categorySlug) : undefined;
    const words = article.content.trim().split(/\s+/).length;
    const readingMinutes = Math.max(1, Math.round(words / 220));

    emit(
      `INSERT INTO articles (
    id, title, slug, excerpt, content, category_id, seo_title, seo_description, keywords,
    author_id, is_published, published_at, reading_minutes, created_at, updated_at
  ) VALUES (
    ${str(id)}, ${str(article.title)}, ${str(article.slug)}, ${str(article.excerpt)},
    ${str(article.content)}, ${str(categoryId ?? null)}, ${str(article.seoTitle)},
    ${str(article.seoDescription)}, ${str(article.keywords)}, ${str(authorId)}, 1, ${NOW},
    ${readingMinutes}, ${NOW}, ${NOW}
  ) ON CONFLICT(slug) DO UPDATE SET
    title = excluded.title,
    excerpt = excluded.excerpt,
    content = excluded.content,
    category_id = excluded.category_id,
    seo_title = excluded.seo_title,
    seo_description = excluded.seo_description,
    keywords = excluded.keywords,
    reading_minutes = excluded.reading_minutes,
    updated_at = ${NOW}`,
    );
  }

  /* ---------------------------- Derived counts -------------------------- */
  section('Denormalised counters');
  emit(
    `UPDATE categories SET prompt_count = (
    SELECT COUNT(*) FROM prompts WHERE prompts.category_id = categories.id AND prompts.is_published = 1
  )`,
  );
  emit(
    `UPDATE tags SET usage_count = (
    SELECT COUNT(*) FROM prompt_tags WHERE prompt_tags.tag_id = tags.id
  )`,
  );
  // `is_trending` is intentionally left as the editorial flags carried by the
  // seed data. The nightly maintenance job owns the real trending set — it
  // clears every flag and re-picks the top 12 by score — so writing a computed
  // set here would only create a state the first cron run immediately replaces.

  const outputDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'seed');
  const outputFile = join(outputDir, 'seed.sql');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputFile, `${lines.join('\n')}\n`, 'utf8');

  const statements = lines.filter((line) => line.trimEnd().endsWith(';')).length;
  console.log(`\n🌱 Wrote ${outputFile}`);
  console.log(`   ${statements} statements`);
  console.log(
    `   ${SEED_CATEGORIES.length} categories · ${allTagNames.size} tags · ${
      allPrompts.length - skipped
    } prompts · ${SEED_ARTICLES.length} articles · ${SEED_PLANS.length} plans`,
  );
  console.log(`   admin: ${adminEmail}`);
  console.log('\n   Apply with: npm run db:seed:local  (or db:seed:remote)\n');
}

main();
