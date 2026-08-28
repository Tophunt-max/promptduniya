import { and, asc, count, desc, eq, isNull, ne, sql } from 'drizzle-orm';

import { db } from '@/db';
import { categories, prompts, tags } from '@/db/schema';
import { AppError } from '@/lib/api';
import { nowSec } from '@/lib/dates';
import { newId } from '@/lib/id';
import { slugify } from '@/lib/utils';

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

export async function listCategories(options: { activeOnly?: boolean } = {}): Promise<
  CategorySummary[]
> {
  const rows = await db
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

  return rows;
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

export async function getCategoryById(id: string) {
  const rows = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function subcategories(parentId: string): Promise<CategorySummary[]> {
  const rows = await db
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
  return rows;
}

export async function allCategorySlugs(): Promise<{ slug: string; updatedAt: number }[]> {
  return db
    .select({ slug: categories.slug, updatedAt: categories.updatedAt })
    .from(categories)
    .where(eq(categories.isActive, true));
}

/* -------------------------------- Admin CRUD ------------------------------- */

async function uniqueCategorySlug(base: string, ignoreId?: string): Promise<string> {
  const seed = slugify(base) || `category-${newId().slice(0, 5).toLowerCase()}`;
  for (let i = 0; i < 40; i++) {
    const candidate = i === 0 ? seed : `${seed}-${i + 1}`;
    const rows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, candidate))
      .limit(1);
    if (!rows[0] || rows[0].id === ignoreId) return candidate;
  }
  return `${seed}-${Date.now().toString(36)}`;
}

export interface CategoryWriteInput {
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  accent?: string;
  coverImageUrl?: string;
  parentId?: string;
  sortOrder?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  seoTitle?: string;
  seoDescription?: string;
}

export async function createCategory(input: CategoryWriteInput) {
  const id = newId();
  const slug = await uniqueCategorySlug(input.slug || input.name);

  await db.insert(categories).values({
    id,
    name: input.name,
    slug,
    description: input.description || null,
    icon: input.icon || null,
    accent: input.accent || 'indigo',
    coverImageUrl: input.coverImageUrl || null,
    parentId: input.parentId || null,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive ?? true,
    isFeatured: input.isFeatured ?? false,
    seoTitle: input.seoTitle || null,
    seoDescription: input.seoDescription || null,
  });

  return { id, slug };
}

export async function updateCategory(id: string, input: CategoryWriteInput) {
  const existing = await getCategoryById(id);
  if (!existing) throw AppError.notFound('Category not found');
  if (input.parentId === id) throw AppError.badRequest('A category cannot be its own parent');

  const slug =
    input.slug && input.slug !== existing.slug ? await uniqueCategorySlug(input.slug, id) : existing.slug;

  await db
    .update(categories)
    .set({
      name: input.name,
      slug,
      description: input.description || null,
      icon: input.icon || null,
      accent: input.accent || existing.accent,
      coverImageUrl: input.coverImageUrl || null,
      parentId: input.parentId || null,
      sortOrder: input.sortOrder ?? existing.sortOrder,
      isActive: input.isActive ?? existing.isActive,
      isFeatured: input.isFeatured ?? existing.isFeatured,
      seoTitle: input.seoTitle || null,
      seoDescription: input.seoDescription || null,
      updatedAt: nowSec(),
    })
    .where(eq(categories.id, id));

  return { id, slug };
}

export async function deleteCategory(id: string): Promise<void> {
  const inUse = await db
    .select({ value: count() })
    .from(prompts)
    .where(eq(prompts.categoryId, id));

  if ((inUse[0]?.value ?? 0) > 0) {
    throw AppError.conflict(
      'This category still has prompts. Move them to another category before deleting.',
    );
  }

  const hasChildren = await db
    .select({ value: count() })
    .from(categories)
    .where(eq(categories.parentId, id));

  if ((hasChildren[0]?.value ?? 0) > 0) {
    throw AppError.conflict('Remove or reassign the subcategories first.');
  }

  await db.delete(categories).where(eq(categories.id, id));
}

export async function adminListCategories() {
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

/* ---------------------------------- Tags ---------------------------------- */

export async function listTags(limit = 60) {
  return db
    .select({ id: tags.id, name: tags.name, slug: tags.slug, usageCount: tags.usageCount })
    .from(tags)
    .orderBy(desc(tags.usageCount))
    .limit(limit);
}

export async function popularTags(limit = 18): Promise<{ name: string; slug: string }[]> {
  const rows = await db
    .select({ name: tags.name, slug: tags.slug })
    .from(tags)
    .where(sql`${tags.usageCount} > 0`)
    .orderBy(desc(tags.usageCount))
    .limit(limit);
  return rows;
}

export async function deleteTag(id: string): Promise<void> {
  await db.delete(tags).where(eq(tags.id, id));
}

export async function renameTag(id: string, name: string): Promise<void> {
  const slug = slugify(name);
  const clash = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.slug, slug), ne(tags.id, id)))
    .limit(1);
  if (clash.length > 0) throw AppError.conflict('Another tag already uses that name');

  await db.update(tags).set({ name, slug, updatedAt: nowSec() }).where(eq(tags.id, id));
}
