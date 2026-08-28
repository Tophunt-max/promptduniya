import type { Metadata } from 'next';
import Link from 'next/link';

import { JsonLd } from '@/components/seo/json-ld';
import { EmptyState } from '@/components/ui/empty-state';
import { FileTextIcon } from '@/components/ui/icon';
import { relativeTime } from '@/lib/dates';
import { breadcrumbSchema, buildMetadata } from '@/lib/seo';
import { listArticles } from '@/services/articles';

export const revalidate = 1800;

export const metadata: Metadata = buildMetadata({
  title: 'Prompt guides and write-ups',
  description:
    'Practical guides on writing AI image prompts — negative prompts, model-specific grammar, and getting genuine Indian specificity into your results.',
  path: '/blog',
  keywords: ['ai prompt guide', 'prompt engineering tutorial', 'negative prompt guide'],
});

export default async function BlogIndexPage() {
  const articles = await listArticles({ limit: 30 }).catch(() => []);
  const [featured, ...rest] = articles;

  return (
    <div className="container-page py-8 sm:py-12">
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Guides', path: '/blog' },
        ])}
      />

      <header className="mb-9 max-w-2xl">
        <h1 className="text-2xl font-extrabold sm:text-3xl">Prompt guides</h1>
        <p className="mt-2 text-sm leading-relaxed text-body">
          The reasoning behind the prompts — what actually moves a result, which model wants which
          grammar, and how to fix the failures you keep hitting.
        </p>
      </header>

      {articles.length === 0 ? (
        <EmptyState
          icon={<FileTextIcon size={24} />}
          title="No guides published yet"
          description="Written guides will appear here as we publish them."
          action={{ label: 'Explore prompts', href: '/explore' }}
        />
      ) : (
        <>
          {featured && (
            <Link
              href={`/blog/${featured.slug}`}
              className="card card-hover group mb-4 block overflow-hidden p-6 sm:p-8"
            >
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">
                Latest · {featured.categoryName ?? 'Guide'}
              </p>
              <h2 className="mt-3 max-w-3xl text-xl font-extrabold leading-snug group-hover:text-brand-600 sm:text-2xl dark:group-hover:text-brand-300">
                {featured.title}
              </h2>
              {featured.excerpt && (
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-body">{featured.excerpt}</p>
              )}
              <p className="mt-5 text-xs text-faint">
                {featured.readingMinutes} min read · {relativeTime(featured.publishedAt)}
                {featured.authorName && ` · ${featured.authorName}`}
              </p>
            </Link>
          )}

          {rest.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((article) => (
                <Link
                  key={article.id}
                  href={`/blog/${article.slug}`}
                  className="card card-hover group flex flex-col p-5"
                >
                  <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">
                    {article.categoryName ?? 'Guide'}
                  </p>
                  <h2 className="mt-2 text-base font-bold leading-snug group-hover:text-brand-600 dark:group-hover:text-brand-300">
                    {article.title}
                  </h2>
                  {article.excerpt && (
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-body">
                      {article.excerpt}
                    </p>
                  )}
                  <p className="mt-4 text-xs text-faint">
                    {article.readingMinutes} min read · {relativeTime(article.publishedAt)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
