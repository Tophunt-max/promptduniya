import type { Metadata } from 'next';

import { CategoryCard } from '@/components/category/category-card';
import { SectionHeader } from '@/components/prompt/prompt-grid';
import { EmptyState } from '@/components/ui/empty-state';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbSchema, buildMetadata } from '@/lib/seo';
import { listCategories } from '@/services/categories';

export const revalidate = 600;

export const metadata: Metadata = buildMetadata({
  title: 'All prompt categories',
  description:
    'Browse every AI prompt category — portraits, couples, saree and traditional looks, weddings, festivals, travel, cars, products, cinematic frames and more.',
  path: '/categories',
  keywords: ['ai prompt categories', 'indian ai photo prompt ideas'],
});

export default async function CategoriesPage() {
  const categories = await listCategories();
  const populated = categories.filter((category) => category.promptCount > 0);
  const upcoming = categories.filter((category) => category.promptCount === 0);

  return (
    <div className="container-page py-8 sm:py-12">
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Categories', path: '/categories' },
        ])}
      />

      <header className="mb-8 max-w-2xl">
        <h1 className="text-2xl font-extrabold sm:text-3xl">Prompt categories</h1>
        <p className="mt-2 text-sm leading-relaxed text-body">
          Start from a theme. Each category collects prompts that share a subject and mood, so you
          can find a consistent look for a whole set of images.
        </p>
      </header>

      {categories.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Categories will appear here as soon as the library is seeded."
          action={{ label: 'Open the generator', href: '/generator' }}
        />
      ) : (
        <>
          <section>
            <SectionHeader title="Browse all" description={`${populated.length} active categories`} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {populated.map((category) => (
                <CategoryCard key={category.id} category={category} />
              ))}
            </div>
          </section>

          {upcoming.length > 0 && (
            <section className="mt-12">
              <SectionHeader
                title="Coming soon"
                description="These categories are set up and waiting on their first prompts."
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {upcoming.map((category) => (
                  <CategoryCard key={category.id} category={category} className="opacity-70" />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
