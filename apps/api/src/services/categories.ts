import { categories, db, tags } from '@pd/db';
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
