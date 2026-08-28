import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CategoryChip, CategoryHero } from '@/components/category/category-card';
import { PromptListing, pageHrefBuilder } from '@/components/prompt/prompt-listing';
import { JsonLd } from '@/components/seo/json-ld';
import { NoPromptsState } from '@/components/ui/empty-state';
import { AI_MODELS } from '@/lib/constants';
import { breadcrumbSchema, buildMetadata } from '@/lib/seo';
import { promptListQuerySchema } from '@/lib/validation';
import { canSeePremium, getAccess } from '@/lib/viewer';
import { getCategoryBySlug, listCategories, subcategories } from '@/services/categories';
import { listPrompts } from '@/services/prompts';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return buildMetadata({ title: 'Category not found', path: `/category/${slug}`, noIndex: true });

  return buildMetadata({
    title: category.seoTitle || `${category.name} AI image prompts`,
    description:
      category.seoDescription ||
      category.description ||
      `Browse ${category.name.toLowerCase()} AI image prompts written for Gemini, Midjourney, Flux and more. Copy in one tap or generate your own variation.`,
    path: `/category/${category.slug}`,
    image: category.coverImageUrl,
    keywords: [`${category.name.toLowerCase()} ai prompts`, `${category.name.toLowerCase()} photo prompts`],
  });
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const raw = await searchParams;

  const category = await getCategoryBySlug(slug);
  if (!category || !category.isActive) notFound();

  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) flat[key] = firstValue(value);

  const query = promptListQuerySchema.parse({ ...flat, category: category.slug });

  const [access, premiumVisible, categories, children] = await Promise.all([
    getAccess(),
    canSeePremium(),
    listCategories(),
    subcategories(category.id),
  ]);

  const result = await listPrompts(query, access.userId);

  return (
    <div className="container-page py-8 sm:py-10">
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Categories', path: '/categories' },
          { name: category.name, path: `/category/${category.slug}` },
        ])}
      />

      <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1.5 text-xs text-faint">
        <Link href="/" className="hover:text-brand-600">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <Link href="/categories" className="hover:text-brand-600">
          Categories
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-[var(--text-primary)]">{category.name}</span>
      </nav>

      <div className="mb-6">
        <CategoryHero
          name={category.name}
          description={category.description}
          promptCount={result.total}
          accent={category.accent}
        />
      </div>

      {children.length > 0 && (
        <div className="snap-rail scrollbar-none mb-6 -mx-1 px-1 pb-1">
          {children.map((child) => (
            <CategoryChip key={child.id} category={child} />
          ))}
        </div>
      )}

      <PromptListing
        result={result}
        categories={categories}
        canSeePremium={premiumVisible}
        buildHref={pageHrefBuilder(`/category/${category.slug}`, flat)}
        lockCategory
        emptyState={
          <NoPromptsState
            description={`No ${category.name.toLowerCase()} prompts match those filters yet. Try clearing a filter or generating your own.`}
          />
        }
      />

      <section className="mt-14 border-t border-[var(--border-subtle)] pt-8">
        <h2 className="text-base font-bold">More {category.name.toLowerCase()} prompts by model</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {AI_MODELS.filter((model) => model.id !== 'other').map((model) => (
            <Link
              key={model.id}
              href={`/category/${category.slug}?model=${model.id}`}
              className="rounded-full border border-[var(--border-subtle)] px-3.5 py-2 text-xs font-semibold text-body transition-colors hover:border-brand-400 hover:text-brand-600"
            >
              {model.label} · {category.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
