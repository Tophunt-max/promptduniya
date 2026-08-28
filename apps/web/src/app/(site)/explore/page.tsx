import type { Metadata } from 'next';

import { PromptListing, pageHrefBuilder } from '@/components/prompt/prompt-listing';
import { NoPromptsState } from '@/components/ui/empty-state';
import { AI_MODELS, SORT_OPTIONS } from '@/lib/constants';
import { buildMetadata } from '@/lib/seo';
import { canSeePremium, getAccess } from '@/lib/viewer';
import { promptListQuerySchema } from '@/lib/validation';
import { listCategories } from '@/services/categories';
import { listPrompts } from '@/services/prompts';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const params = await searchParams;
  const model = firstValue(params.model);
  const access = firstValue(params.access);
  const sort = firstValue(params.sort);

  const modelLabel = AI_MODELS.find((m) => m.id === model)?.label;
  const sortLabel = SORT_OPTIONS.find((s) => s.id === sort)?.label;

  const parts = [
    access === 'premium' ? 'Premium' : access === 'free' ? 'Free' : null,
    modelLabel,
    'AI image prompts',
    sortLabel && sort !== 'trending' ? `— ${sortLabel}` : null,
  ].filter(Boolean);

  return buildMetadata({
    title: parts.join(' '),
    description: modelLabel
      ? `Browse ${modelLabel} image prompts written and tested for ${modelLabel}. Copy in one tap, save your favourites, and filter by style, subject and aspect ratio.`
      : 'Browse the full library of AI image prompts. Filter by category, AI model, style, subject and aspect ratio.',
    path: '/explore',
    // Filtered permutations are canonicalised to /explore to avoid thin,
    // near-duplicate pages competing with each other in search results.
    noIndex: Boolean(model || access || sort || params.style || params.gender || params.aspect),
  });
}

export default async function ExplorePage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) flat[key] = firstValue(value);

  const query = promptListQuerySchema.parse(flat);
  const [access, premiumVisible, categories] = await Promise.all([
    getAccess(),
    canSeePremium(),
    listCategories(),
  ]);

  const result = await listPrompts(query, access.userId);

  return (
    <div className="container-page py-8 sm:py-10">
      <PromptListing
        result={result}
        categories={categories}
        canSeePremium={premiumVisible}
        buildHref={pageHrefBuilder('/explore', flat)}
        emptyState={
          <NoPromptsState description="Nothing matches those filters yet. Try clearing a couple of them, or generate a prompt of your own." />
        }
        header={
          <header className="mb-6">
            <h1 className="text-2xl font-extrabold sm:text-3xl">Explore AI image prompts</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-body">
              Every prompt lists the model it was written for, plus the style, lighting and camera
              choices baked into it. Filter down to exactly what you need.
            </p>
          </header>
        }
      />
    </div>
  );
}
