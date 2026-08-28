import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { Hero } from '@/components/home/hero';
import { CreateCallouts, HowItWorks, PremiumBanner } from '@/components/home/value-props';
import { CategoryGrid } from '@/components/category/category-card';
import { PromptGrid, Section, SectionHeader } from '@/components/prompt/prompt-grid';
import { CategoryGridSkeleton, PromptGridSkeleton } from '@/components/ui/skeleton';
import { AI_MODELS } from '@/lib/constants';
import { buildMetadata } from '@/lib/seo';
import { canSeePremium, getAccess } from '@/lib/viewer';
import { platformStats, popularSearchTerms } from '@/services/analytics';
import { listArticles } from '@/services/articles';
import { featuredCategories } from '@/services/categories';
import { latestPrompts, premiumShowcase, trendingPrompts } from '@/services/prompts';
import { relativeTime } from '@/lib/dates';

export const revalidate = 300;

export const metadata: Metadata = buildMetadata({
  title: 'AI image prompts for Indian creators — trending, free and premium',
  description:
    'Browse trending AI image prompts for Gemini, Midjourney, Flux and more. Copy in one tap, save your favourites, or generate a brand-new prompt around your own idea.',
  path: '/',
  keywords: [
    'ai image prompts',
    'gemini photo prompts',
    'indian ai prompts',
    'midjourney prompts',
    'ai prompt generator',
  ],
});

export default async function HomePage() {
  const access = await getAccess();
  const premiumVisible = await canSeePremium();
  const viewerId = access.userId;

  const [stats, categories, trending, latest, premium, articles, popular] = await Promise.all([
    platformStats().catch(() => null),
    featuredCategories(12).catch(() => []),
    trendingPrompts(8, viewerId).catch(() => []),
    latestPrompts(8, viewerId).catch(() => []),
    premiumShowcase(4, viewerId).catch(() => []),
    listArticles({ limit: 3 }).catch(() => []),
    popularSearchTerms(6).catch(() => []),
  ]);

  return (
    <>
      <Hero
        promptCount={stats?.publishedPrompts ?? 0}
        categoryCount={categories.length}
        copyCount={stats?.promptCopies ?? 0}
        popularSearches={popular}
      />

      <div className="container-page">
        <Section id="trending" className="pt-4 sm:pt-6">
          <SectionHeader
            eyebrow="What everyone is using"
            title={
              <span className="flex items-center gap-2">
                <span aria-hidden="true">🔥</span> Trending prompts
              </span>
            }
            description="Ranked by real copies, saves and likes over the last few days — not by upload date."
            action={{ label: 'View all', href: '/explore?sort=trending' }}
          />
          <Suspense fallback={<PromptGridSkeleton count={8} />}>
            <PromptGrid prompts={trending} canSeePremium={premiumVisible} priorityCount={4} />
          </Suspense>
        </Section>

        <Section>
          <SectionHeader
            eyebrow="Browse by theme"
            title="Categories"
            description="From saree portraits and wedding sets to product shots, cars and cinematic frames."
            action={{ label: 'All categories', href: '/categories' }}
          />
          <Suspense fallback={<CategoryGridSkeleton />}>
            <CategoryGrid categories={categories} />
          </Suspense>
        </Section>

        <Section>
          <CreateCallouts />
        </Section>

        <Section>
          <SectionHeader
            eyebrow="Fresh from the studio"
            title="Latest prompts"
            description="Newly published prompts, still warm."
            action={{ label: 'See newest', href: '/explore?sort=newest' }}
          />
          <PromptGrid prompts={latest} canSeePremium={premiumVisible} priorityCount={0} />
        </Section>

        <Section>
          <SectionHeader
            eyebrow="Pick your tool"
            title="Prompts by AI model"
            description="Each prompt is written in the grammar its target model responds to best."
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {AI_MODELS.filter((model) => model.id !== 'other').map((model) => (
              <Link
                key={model.id}
                href={`/explore?model=${model.id}`}
                className="card card-hover group p-4"
              >
                <p className="text-sm font-bold group-hover:text-brand-600 dark:group-hover:text-brand-300">
                  {model.label}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-faint">{model.note}</p>
              </Link>
            ))}
          </div>
        </Section>

        {premium.length > 0 && (
          <Section>
            <SectionHeader
              eyebrow="Members only"
              title="From the premium collection"
              description="Longer, more specific prompts with negative prompts and setup notes included."
              action={{ label: 'Browse premium', href: '/explore?access=premium' }}
            />
            <PromptGrid
              prompts={premium}
              canSeePremium={premiumVisible}
              priorityCount={0}
              columns={4}
            />
          </Section>
        )}

        <Section>
          <PremiumBanner isPremium={access.isPremium} />
        </Section>

        <Section>
          <SectionHeader
            eyebrow="How it works"
            title="Three steps from idea to image"
          />
          <HowItWorks />
        </Section>

        {articles.length > 0 && (
          <Section>
            <SectionHeader
              eyebrow="Read up"
              title="Prompt guides"
              description="Practical write-ups on getting consistent results out of each model."
              action={{ label: 'All guides', href: '/blog' }}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              {articles.map((article) => (
                <Link
                  key={article.id}
                  href={`/blog/${article.slug}`}
                  className="card card-hover group flex flex-col p-5"
                >
                  <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">
                    {article.categoryName ?? 'Guide'}
                  </p>
                  <h3 className="mt-2 text-base font-bold leading-snug group-hover:text-brand-600 dark:group-hover:text-brand-300">
                    {article.title}
                  </h3>
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
          </Section>
        )}
      </div>
    </>
  );
}
