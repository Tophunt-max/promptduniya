import { categories, db, prompts, tags } from '@pd/db';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

/** Category and tag reads for the website. */

export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  accent: string;
  coverImageUrl: string | null;
  promptCount: number;
  isFeatured: boolean;
  sortOrder: number;
}

export async function listCategories(options: { activeOnly?: boolean } = {}): Promise<CategorySummary[]> {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      icon: categories.icon,
      accent: categories.accent,
      coverImageUrl: categories.coverImageUrl,
      promptCount: categories.promptCount,
      isFeatured: categories.isFeatured,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .where(
      options.activeOnly === false
        ? undefined
        : and(eq(categories.isActive, true), isNull(categories.parentId)),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function featuredCategories(limit = 12): Promise<CategorySummary[]> {
  const all = await listCategories();
  const featured = all.filter((c) => c.isFeatured);
  const rest = all.filter((c) => !c.isFeatured).sort((a, b) => b.promptCount - a.promptCount);
  return [...featured, ...rest].slice(0, limit);
}

export async function getCategoryBySlug(slug: string) {
  const rows = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function allCategorySlugs(): Promise<{ slug: string; updatedAt: number }[]> {
  return db
    .select({ slug: categories.slug, updatedAt: categories.updatedAt })
    .from(categories)
    .where(eq(categories.isActive, true));
}

export async function popularTags(limit = 18): Promise<{ name: string; slug: string }[]> {
  return db
    .select({ name: tags.name, slug: tags.slug })
    .from(tags)
    .where(sql`${tags.usageCount} > 0`)
    .orderBy(desc(tags.usageCount))
    .limit(limit);
}


/* =========================== Admin writes ============================= */

import { newId } from '../lib/crypto';
import { nowSec } from '../lib/dates';
import { AppError } from '../lib/errors';
import { slugify } from '@pd/shared';

export interface CategoryWriteInput {
  name: string;
  slug?: string;
  description?: string | null;
  icon?: string | null;
  accent?: string;
  coverImageUrl?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

export interface AdminCategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  accent: string;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  promptCount: number;
  updatedAt: number;
}

/** Admin listing includes inactive categories and sub-categories. */
export async function adminListCategories(): Promise<AdminCategoryRow[]> {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      accent: categories.accent,
      icon: categories.icon,
      parentId: categories.parentId,
      sortOrder: categories.sortOrder,
      isActive: categories.isActive,
      isFeatured: categories.isFeatured,
      promptCount: categories.promptCount,
      updatedAt: categories.updatedAt,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

/** Active children of a category. */
export async function subcategories(parentId: string): Promise<CategorySummary[]> {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      icon: categories.icon,
      accent: categories.accent,
      coverImageUrl: categories.coverImageUrl,
      promptCount: categories.promptCount,
      isFeatured: categories.isFeatured,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .where(and(eq(categories.parentId, parentId), eq(categories.isActive, true)))
    .orderBy(asc(categories.sortOrder));
}

export async function listTags(limit = 60) {
  return db
    .select({ id: tags.id, name: tags.name, slug: tags.slug, usageCount: tags.usageCount })
    .from(tags)
    .orderBy(desc(tags.usageCount))
    .limit(limit);
}

async function ensureUniqueCategorySlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || 'category';
  let candidate = root;
  let n = 1;
  for (;;) {
    const existing = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, candidate))
      .limit(1);
    const hit = existing[0];
    if (!hit || hit.id === excludeId) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

export async function createCategory(input: CategoryWriteInput) {
  if (!input.name?.trim()) throw AppError.badRequest('Name is required');
  const id = newId();
  const slug = await ensureUniqueCategorySlug(input.slug || input.name);
  await db.insert(categories).values({
    id,
    name: input.name,
    slug,
    description: input.description ?? null,
    icon: input.icon ?? null,
    accent: input.accent ?? 'indigo',
    coverImageUrl: input.coverImageUrl ?? null,
    parentId: input.parentId ?? null,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
    isFeatured: input.isFeatured ?? false,
    seoTitle: input.seoTitle ?? null,
    seoDescription: input.seoDescription ?? null,
  });
  return getCategoryById(id);
}

export async function updateCategory(id: string, input: CategoryWriteInput) {
  const existing = await getCategoryById(id);
  if (!existing) throw AppError.notFound('Category not found');
  if (!input.name?.trim()) throw AppError.badRequest('Name is required');
  const slug = input.slug && input.slug !== existing.slug
    ? await ensureUniqueCategorySlug(input.slug, id)
    : existing.slug;
  await db
    .update(categories)
    .set({
      name: input.name,
      slug,
      description: input.description ?? null,
      icon: input.icon ?? null,
      accent: input.accent ?? existing.accent,
      coverImageUrl: input.coverImageUrl ?? null,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder ?? existing.sortOrder,
      isActive: input.isActive ?? existing.isActive,
      isFeatured: input.isFeatured ?? existing.isFeatured,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      updatedAt: nowSec(),
    })
    .where(eq(categories.id, id));
  return getCategoryById(id);
}

export async function deleteCategory(id: string): Promise<void> {
  const existing = await getCategoryById(id);
  if (!existing) throw AppError.notFound('Category not found');
  const [inUse] = await db
    .select({ value: sql<number>`count(*)` })
    .from(prompts)
    .where(eq(prompts.categoryId, id));
  if ((inUse?.value ?? 0) > 0) {
    throw AppError.conflict('Category still has prompts assigned to it');
  }
  await db.delete(categories).where(eq(categories.id, id));
}

export async function getCategoryById(id: string) {
  const rows = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return rows[0] ?? null;
}
