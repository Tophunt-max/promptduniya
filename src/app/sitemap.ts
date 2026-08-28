import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/seo';
import { allArticleSlugs } from '@/services/articles';
import { allCategorySlugs } from '@/services/categories';
import { allPromptSlugs } from '@/services/prompts';

export const revalidate = 3600;

/**
 * Dynamic sitemap.
 *
 * Only pages with genuine, unique content are listed. Filtered listing
 * permutations, search results, dashboards and the admin panel are deliberately
 * excluded — indexing them would create thin, near-duplicate pages.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/explore'), lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/categories'), lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/generator'), lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    {
      url: absoluteUrl('/random-prompt'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    { url: absoluteUrl('/premium'), lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/blog'), lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: absoluteUrl('/about'), lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: absoluteUrl('/contact'), lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: absoluteUrl('/privacy'), lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: absoluteUrl('/terms'), lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: absoluteUrl('/cookies'), lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    {
      url: absoluteUrl('/refund-policy'),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    { url: absoluteUrl('/disclaimer'), lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];

  // A cold or unmigrated database must not break the sitemap.
  const [prompts, categories, articles] = await Promise.all([
    allPromptSlugs().catch(() => []),
    allCategorySlugs().catch(() => []),
    allArticleSlugs().catch(() => []),
  ]);

  const promptEntries: MetadataRoute.Sitemap = prompts.map((prompt) => ({
    url: absoluteUrl(`/prompt/${prompt.slug}`),
    lastModified: new Date(prompt.updatedAt * 1000),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const categoryEntries: MetadataRoute.Sitemap = categories.map((category) => ({
    url: absoluteUrl(`/category/${category.slug}`),
    lastModified: new Date(category.updatedAt * 1000),
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  const articleEntries: MetadataRoute.Sitemap = articles.map((article) => ({
    url: absoluteUrl(`/blog/${article.slug}`),
    lastModified: new Date(article.updatedAt * 1000),
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [...staticEntries, ...categoryEntries, ...promptEntries, ...articleEntries];
}
