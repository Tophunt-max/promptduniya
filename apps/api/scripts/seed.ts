/**
 * Database seeder.
 *
 * Idempotent: re-running it updates existing rows rather than duplicating them.
 * Credentials come from environment variables — no secrets are committed here.
 *
 *   npm run db:seed
 */
import 'dotenv/config';

import { eq } from 'drizzle-orm';

import { getClient, getDb } from '../src/db';
import { categories, prompts, roles, siteSettings, tags } from '../src/db/schema';
import { nowSec } from '../src/lib/dates';
import { newId } from '../src/lib/id';
import { slugify } from '../src/lib/utils';
import { createArticle } from '../src/services/articles';
import { assignRole, createUser, findUserByEmail } from '../src/services/auth';
import { createPrompt } from '../src/services/prompts';
import { upsertPlan } from '../src/services/plans';
import { grantPremium } from '../src/services/subscriptions';
import { SETTING_DEFAULTS, setSettings } from '../src/services/settings';
import { SEED_ARTICLES } from './seed/articles';
import { SEED_CATEGORIES, SEED_PLANS, SEED_TAGS } from './seed/catalog';
import { EXTRA_PROMPTS } from './seed/prompts-extra';
import { FREE_PROMPTS } from './seed/prompts-free';
import { PREMIUM_PROMPTS } from './seed/prompts-premium';
import type { SeedPrompt } from './seed/prompt-types';

const ROLES = [
  { name: 'admin', description: 'Full access to the admin panel and all settings' },
  { name: 'editor', description: 'Can manage prompts, categories and articles' },
  { name: 'creator', description: 'Can submit prompts for review' },
  { name: 'user', description: 'Standard member account' },
];

function log(step: string, detail?: string) {
  console.log(`  ✓ ${step}${detail ? ` — ${detail}` : ''}`);
}

async function seedRoles() {
  for (const role of ROLES) {
    const existing = await getDb()
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, role.name))
      .limit(1);
    if (existing.length === 0) {
      await getDb().insert(roles).values({ id: newId(), ...role });
    }
  }
  log('roles', ROLES.map((r) => r.name).join(', '));
}

async function seedSettings() {
  // Only write the defaults that are not already present, so an operator's
  // admin-panel changes are never clobbered by a re-seed.
  const existing = await getDb().select({ key: siteSettings.key }).from(siteSettings);
  const present = new Set(existing.map((row) => row.key));

  const toWrite: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    if (!present.has(key)) toWrite[key] = value;
  }

  if (Object.keys(toWrite).length > 0) await setSettings(toWrite);
  log('site settings', `${Object.keys(toWrite).length} defaults written`);
}

async function seedPlans() {
  for (const plan of SEED_PLANS) {
    await upsertPlan({
      code: plan.code,
      name: plan.name,
      description: plan.description,
      priceMinor: plan.priceMinor,
      currency: 'INR',
      billingPeriod: plan.billingPeriod,
      intervalCount: 1,
      trialDays: 0,
      features: plan.features,
      limits: plan.limits,
      isActive: true,
      isPopular: plan.isPopular ?? false,
      sortOrder: plan.sortOrder,
    });
  }
  log('plans', SEED_PLANS.map((p) => `${p.code} ₹${p.priceMinor / 100}`).join(', '));
}

async function seedCategories(): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  for (const [index, category] of SEED_CATEGORIES.entries()) {
    const existing = await getDb()
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, category.slug))
      .limit(1);

    if (existing[0]) {
      map.set(category.slug, existing[0].id);
      await getDb()
        .update(categories)
        .set({
          name: category.name,
          description: category.description,
          icon: category.icon,
          accent: category.accent,
          isFeatured: category.featured ?? false,
          sortOrder: index,
          updatedAt: nowSec(),
        })
        .where(eq(categories.id, existing[0].id));
      continue;
    }

    const id = newId();
    await getDb().insert(categories).values({
      id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      icon: category.icon,
      accent: category.accent,
      isActive: true,
      isFeatured: category.featured ?? false,
      sortOrder: index,
      seoTitle: `${category.name} AI image prompts`,
      seoDescription: category.description,
    });
    map.set(category.slug, id);
  }

  log('categories', `${map.size} total`);
  return map;
}

async function seedTags() {
  for (const name of SEED_TAGS) {
    const slug = slugify(name);
    const existing = await getDb()
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.slug, slug))
      .limit(1);
    if (existing.length === 0) {
      await getDb().insert(tags).values({ id: newId(), name, slug });
    }
  }
  log('tags', `${SEED_TAGS.length} total`);
}

interface SeedUsers {
  adminId: string;
  demoId: string;
  freeId: string;
  premiumId: string;
}

async function seedUsers(): Promise<SeedUsers> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@promptduniya.in';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!Admin123';
  const adminName = process.env.SEED_ADMIN_NAME ?? 'Duniya Admin';
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? 'ChangeMe!Demo123';

  async function ensure(input: {
    email: string;
    name: string;
    username: string;
    password: string;
    roleNames: string[];
  }): Promise<string> {
    const existing = await findUserByEmail(input.email);
    if (existing) {
      for (const role of input.roleNames) await assignRole(existing.id, role);
      return existing.id;
    }
    const user = await createUser({
      name: input.name,
      email: input.email,
      username: input.username,
      password: input.password,
      roleNames: input.roleNames,
      emailVerified: true,
    });
    return user.id;
  }

  const adminId = await ensure({
    email: adminEmail,
    name: adminName,
    username: 'admin',
    password: adminPassword,
    roleNames: ['admin', 'editor', 'user'],
  });

  const demoId = await ensure({
    email: 'editor@promptduniya.in',
    name: 'Demo Editor',
    username: 'editor',
    password: demoPassword,
    roleNames: ['editor', 'user'],
  });

  const freeId = await ensure({
    email: 'free@promptduniya.in',
    name: 'Free Member',
    username: 'freemember',
    password: demoPassword,
    roleNames: ['user'],
  });

  const premiumId = await ensure({
    email: 'premium@promptduniya.in',
    name: 'Premium Member',
    username: 'premiummember',
    password: demoPassword,
    roleNames: ['user'],
  });

  // Give the premium demo account a real, date-bounded subscription so the
  // entitlement system is exercised rather than a hard-coded flag.
  await grantPremium({ userId: premiumId, planCode: 'yearly', days: 365 });

  log('users', 'admin, editor, free member, premium member');
  return { adminId, demoId, freeId, premiumId };
}

async function seedPrompts(categoryMap: Map<string, string>, authorId: string) {
  const all: SeedPrompt[] = [...FREE_PROMPTS, ...PREMIUM_PROMPTS, ...EXTRA_PROMPTS];
  let createdCount = 0;
  let skipped = 0;

  for (const seed of all) {
    const existing = await getDb()
      .select({ id: prompts.id })
      .from(prompts)
      .where(eq(prompts.slug, seed.slug))
      .limit(1);

    if (existing.length > 0) {
      skipped += 1;
      continue;
    }

    const categoryId = categoryMap.get(seed.categorySlug);
    if (!categoryId) {
      console.warn(`  ! skipping "${seed.slug}" — unknown category ${seed.categorySlug}`);
      continue;
    }

    await createPrompt(
      {
        title: seed.title,
        slug: seed.slug,
        shortDescription: seed.shortDescription,
        promptText: seed.promptText,
        negativePrompt: seed.negativePrompt,
        usageInstructions: seed.usageInstructions,
        aiModel: seed.aiModel,
        categoryId,
        style: seed.style,
        gender: seed.gender,
        ageGroup: seed.ageGroup,
        location: seed.location,
        aspectRatio: seed.aspectRatio,
        cameraStyle: seed.cameraStyle,
        lighting: seed.lighting,
        mood: seed.mood,
        difficulty: seed.difficulty,
        tags: seed.tags,
        isPremium: seed.isPremium ?? false,
        isFeatured: seed.isFeatured ?? false,
        isTrending: seed.isTrending ?? false,
        isEditorsPick: seed.isEditorsPick ?? false,
        isPublished: true,
        exampleImages: [],
        seoTitle: seed.seoTitle,
        seoDescription: seed.seoDescription,
      },
      authorId,
    );
    createdCount += 1;
  }

  const premium = all.filter((p) => p.isPremium).length;
  log(
    'prompts',
    `${createdCount} created, ${skipped} already present (${all.length} total, ${premium} premium)`,
  );
}

async function seedArticles(categoryMap: Map<string, string>, authorId: string) {
  const { articles } = await import('../src/db/schema');
  let createdCount = 0;

  for (const article of SEED_ARTICLES) {
    const existing = await getDb()
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.slug, article.slug))
      .limit(1);
    if (existing.length > 0) continue;

    await createArticle(
      {
        title: article.title,
        slug: article.slug,
        excerpt: article.excerpt,
        content: article.content,
        categoryId: article.categorySlug ? categoryMap.get(article.categorySlug) : undefined,
        seoTitle: article.seoTitle,
        seoDescription: article.seoDescription,
        keywords: article.keywords,
        isPublished: true,
      },
      authorId,
    );
    createdCount += 1;
  }

  log('articles', `${createdCount} created of ${SEED_ARTICLES.length}`);
}

async function recomputeCounters() {
  const { recomputeTrending } = await import('../src/services/prompts');
  const trending = await recomputeTrending();
  log('trending scores', `${trending} prompts flagged as trending`);
}

async function main() {
  console.log('\n🌱 Seeding promptduniya\n');

  await seedRoles();
  await seedSettings();
  await seedPlans();
  const categoryMap = await seedCategories();
  await seedTags();
  const seedUserIds = await seedUsers();
  await seedPrompts(categoryMap, seedUserIds.adminId);
  await seedArticles(categoryMap, seedUserIds.adminId);
  await recomputeCounters();

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@promptduniya.in';
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? 'ChangeMe!Demo123';

  console.log(`
✅ Seed complete.

  Admin panel   /admin
  Admin login   ${adminEmail}
                (password from SEED_ADMIN_PASSWORD in your .env)

  Demo accounts (password: ${demoPassword})
    editor@promptduniya.in    editor role
    free@promptduniya.in      free member
    premium@promptduniya.in   premium member (yearly, 365 days)

  Change every seeded password before deploying anywhere public.
`);

  getClient().close();
}

main().catch((error) => {
  console.error('\n✗ Seed failed\n');
  console.error(error);
  process.exit(1);
});
