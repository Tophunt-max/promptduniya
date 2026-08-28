import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PromptGrid, SectionHeader } from '@/components/prompt/prompt-grid';
import { ArticleBody } from '@/components/legal/article-body';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { ShareButton } from '@/components/prompt/share-button';
import { formatDate } from '@/lib/dates';
import { articleSchema, breadcrumbSchema, buildMetadata } from '@/lib/seo';
import { truncate } from '@/lib/utils';
import { canSeePremium, getAccess } from '@/lib/viewer';
import {
  allArticleSlugs,
  getArticleBySlug,
  incrementArticleViews,
  relatedArticles,
} from '@/services/articles';
import { trendingPrompts } from '@/services/prompts';

export const revalidate = 1800;

type Params = Promise<{ slug: string }>;

export async function generateStaticParams() {
  try {
    const slugs = await allArticleSlugs();
    return slugs.map(({ slug }) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    return buildMetadata({ title: 'Guide not found', path: `/blog/${slug}`, noIndex: true });
  }

  return buildMetadata({
    title: article.seoTitle || article.title,
    description: article.seoDescription || article.excerpt || truncate(article.content, 280),
    path: `/blog/${article.slug}`,
    image: article.featuredImageUrl,
    type: 'article',
    keywords: article.keywords?.split(',').map((keyword) => keyword.trim()),
    publishedTime: article.publishedAt
      ? new Date(article.publishedAt * 1000).toISOString()
      : undefined,
    modifiedTime: new Date(article.updatedAt * 1000).toISOString(),
    authors: article.authorName ? [article.authorName] : undefined,
  });
}

export default async function ArticlePage({ params }: { params: Params }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  const [access, premiumVisible] = await Promise.all([getAccess(), canSeePremium()]);

  const [related, prompts] = await Promise.all([
    relatedArticles(article.slug, article.categoryId, 3).catch(() => []),
    trendingPrompts(4, access.userId).catch(() => []),
  ]);

  // Fire-and-forget: a failed counter must never break the page.
  void incrementArticleViews(article.id).catch(() => {});

  const path = `/blog/${article.slug}`;

  return (
    <div className="container-page py-8 sm:py-12">
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Guides', path: '/blog' },
          { name: article.title, path },
        ])}
      />
      <JsonLd
        data={articleSchema({
          title: article.title,
          description: article.seoDescription || article.excerpt || '',
          path,
          image: article.featuredImageUrl,
          authorName: article.authorName,
          datePublished: article.publishedAt,
          dateModified: article.updatedAt,
        })}
      />

      <article className="mx-auto max-w-3xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex flex-wrap items-center gap-1.5 text-xs text-faint"
        >
          <Link href="/" className="hover:text-brand-600">
            Home
          </Link>
          <span aria-hidden="true">/</span>
          <Link href="/blog" className="hover:text-brand-600">
            Guides
          </Link>
          <span aria-hidden="true">/</span>
          <span className="truncate font-semibold text-[var(--text-primary)]">{article.title}</span>
        </nav>

        <header className="mb-8">
          {article.categoryName && (
            <Link href={`/category/${article.categorySlug}`}>
              <Badge tone="brand" className="mb-3">
                {article.categoryName}
              </Badge>
            </Link>
          )}

          <h1 className="text-2xl font-extrabold leading-tight sm:text-4xl">{article.title}</h1>

          {article.excerpt && (
            <p className="mt-4 text-base leading-relaxed text-body">{article.excerpt}</p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
            <div className="text-xs text-faint">
              <p>
                By{' '}
                <strong className="font-semibold text-[var(--text-primary)]">
                  {article.authorName ?? 'promptduniya team'}
                </strong>
              </p>
              <p className="mt-0.5">
                {formatDate(article.publishedAt)} · {article.readingMinutes} min read
              </p>
            </div>
            <ShareButton
              title={article.title}
              path={path}
              description={article.excerpt ?? undefined}
              variant="button"
            />
          </div>
        </header>

        <ArticleBody content={article.content} />

        <footer className="mt-10 border-t border-[var(--border-subtle)] pt-6">
          <div className="card gradient-brand border-0 p-6 text-white">
            <h2 className="text-lg font-extrabold">Put this into practice</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/85">
              Browse prompts that already apply these ideas, or feed your own brief into the
              generator.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Link
                href="/explore"
                className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-white/90"
              >
                Explore prompts
              </Link>
              <Link
                href="/generator"
                className="rounded-xl border border-white/30 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white"
              >
                Open the generator
              </Link>
            </div>
          </div>
        </footer>
      </article>

      {related.length > 0 && (
        <section className="mt-14">
          <SectionHeader title="More guides" action={{ label: 'All guides', href: '/blog' }} />
          <div className="grid gap-3 sm:grid-cols-3">
            {related.map((item) => (
              <Link
                key={item.id}
                href={`/blog/${item.slug}`}
                className="card card-hover group flex flex-col p-5"
              >
                <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">
                  {item.categoryName ?? 'Guide'}
                </p>
                <h3 className="mt-2 text-sm font-bold leading-snug group-hover:text-brand-600 dark:group-hover:text-brand-300">
                  {item.title}
                </h3>
                <p className="mt-3 text-xs text-faint">{item.readingMinutes} min read</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {prompts.length > 0 && (
        <section className="mt-14">
          <SectionHeader
            title="Trending prompts"
            action={{ label: 'See all', href: '/explore?sort=trending' }}
          />
          <PromptGrid prompts={prompts} canSeePremium={premiumVisible} priorityCount={0} />
        </section>
      )}
    </div>
  );
}
