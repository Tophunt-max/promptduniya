import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PromptArtwork } from '@/components/prompt/prompt-artwork';
import { PromptGrid, SectionHeader } from '@/components/prompt/prompt-grid';
import { PromptViewer, ViewTracker } from '@/components/prompt/prompt-viewer';
import { FavoriteButton, LikeButton } from '@/components/prompt/prompt-actions';
import { ShareButton } from '@/components/prompt/share-button';
import { JsonLd } from '@/components/seo/json-ld';
import {
  Badge,
  DifficultyBadge,
  EditorsPickBadge,
  ModelBadge,
  PremiumBadge,
  TrendingBadge,
} from '@/components/ui/badge';
import { CameraIcon, CopyIcon, EyeIcon, HeartIcon, SparkleIcon } from '@/components/ui/icon';
import { aiModel, inputMode } from '@/lib/constants';
import { formatDate, relativeTime } from '@/lib/dates';
import { breadcrumbSchema, buildMetadata, creativeWorkSchema, faqSchema } from '@/lib/seo';
import { formatCompact, truncate } from '@/lib/utils';
import { canSeePremium, getAccess } from '@/lib/viewer';
import { popularSearches } from '@/services/search';
import { allPromptSlugs, getPromptBySlug, relatedPrompts } from '@/services/prompts';

type Params = Promise<{ slug: string }>;

export const revalidate = 600;

/** Pre-renders the published catalogue at build time for fast first loads. */
export async function generateStaticParams() {
  try {
    const slugs = await allPromptSlugs();
    return slugs.slice(0, 200).map(({ slug }) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const prompt = await getPromptBySlug(slug);

  if (!prompt) {
    return buildMetadata({ title: 'Prompt not found', path: `/prompt/${slug}`, noIndex: true });
  }

  const model = aiModel(prompt.aiModel);

  return buildMetadata({
    title: prompt.seoTitle || `${prompt.title} — ${model.label} prompt`,
    description:
      prompt.seoDescription ||
      truncate(
        `${prompt.shortDescription} A ready-to-use ${model.label} image prompt in the ${prompt.categoryName} category.`,
        300,
      ),
    path: `/prompt/${prompt.slug}`,
    image: prompt.coverImageUrl,
    type: 'article',
    keywords: [
      `${model.label.toLowerCase()} prompt`,
      `${prompt.categoryName.toLowerCase()} ai prompt`,
      ...prompt.tags.map((tag) => tag.name.toLowerCase()),
    ],
    publishedTime: prompt.publishedAt
      ? new Date(prompt.publishedAt * 1000).toISOString()
      : undefined,
    modifiedTime: new Date(prompt.updatedAt * 1000).toISOString(),
  });
}

export default async function PromptDetailPage({ params }: { params: Params }) {
  const { slug } = await params;

  const [access, premiumVisible] = await Promise.all([getAccess(), canSeePremium()]);

  const prompt = await getPromptBySlug(slug, {
    viewerId: access.userId,
    canSeePremium: premiumVisible,
  });

  if (!prompt) notFound();

  const [related, popular] = await Promise.all([
    relatedPrompts(prompt, access.userId),
    popularSearches(6).catch(() => []),
  ]);

  const model = aiModel(prompt.aiModel);
  const mode = inputMode(prompt.inputMode);
  const path = `/prompt/${prompt.slug}`;

  const specs: { label: string; value: string | null }[] = [
    { label: 'AI model', value: model.label },
    { label: 'Input', value: mode.label },
    { label: 'Category', value: prompt.categoryName },
    { label: 'Style', value: prompt.style },
    { label: 'Subject', value: prompt.gender },
    { label: 'Age group', value: prompt.ageGroup },
    { label: 'Location', value: prompt.location },
    { label: 'Aspect ratio', value: prompt.aspectRatio },
    { label: 'Camera', value: prompt.cameraStyle },
    { label: 'Lighting', value: prompt.lighting },
    { label: 'Mood', value: prompt.mood },
  ].filter((spec): spec is { label: string; value: string } => Boolean(spec.value));

  const faqs = [
    {
      question: `Which AI model is this prompt for?`,
      answer: `This prompt is written for ${model.label}. ${model.note} You can adapt it for other models, but the wording is tuned for ${model.label}.`,
    },
    {
      question: 'Can I use the generated images commercially?',
      answer:
        'The prompt text is free for you to use and adapt. Rights over the images you generate are governed by the terms of the AI tool you run the prompt in — check that provider\u2019s licence.',
    },
    {
      question: 'Why do my results look different?',
      answer:
        'Image models are non-deterministic, so the same prompt produces different frames each run. Generate three or four variations and pick the strongest composition.',
    },
  ];

  return (
    <div className="container-page py-6 sm:py-9">
      <ViewTracker promptId={prompt.id} path={path} />

      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: prompt.categoryName, path: `/category/${prompt.categorySlug}` },
          { name: model.label, path: `/explore?model=${prompt.aiModel}` },
          { name: prompt.title, path },
        ])}
      />
      <JsonLd
        data={creativeWorkSchema({
          title: prompt.title,
          description: prompt.shortDescription,
          path,
          image: prompt.coverImageUrl,
          datePublished: prompt.publishedAt,
          dateModified: prompt.updatedAt,
          keywords: prompt.tags.map((tag) => tag.name),
          isFree: !prompt.isPremium,
        })}
      />
      <JsonLd data={faqSchema(faqs)} />

      <nav
        aria-label="Breadcrumb"
        className="mb-5 flex flex-wrap items-center gap-1.5 text-xs text-faint"
      >
        <Link href="/" className="hover:text-brand-600">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={`/category/${prompt.categorySlug}`} className="hover:text-brand-600">
          {prompt.categoryName}
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={`/explore?model=${prompt.aiModel}`} className="hover:text-brand-600">
          {model.short}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="truncate font-semibold text-[var(--text-primary)]">Prompt</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-10">
        {/* Visual column */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="card overflow-hidden">
            <PromptArtwork
              seed={prompt.slug}
              title={prompt.title}
              imageUrl={prompt.coverImageUrl}
              alt={prompt.coverImageAlt}
              ratio="portrait"
              priority
              sizes="(max-width: 1024px) 100vw, 44vw"
              locked={prompt.locked}
              category={prompt.categorySlug}
              style={prompt.style}
            />
          </div>

          {prompt.images.length > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {prompt.images.slice(0, 4).map((image) => (
                <div key={image.id} className="card overflow-hidden">
                  <PromptArtwork
                    seed={image.id}
                    title={prompt.title}
                    imageUrl={image.url}
                    alt={image.alt ?? `Example output for ${prompt.title}`}
                    ratio="square"
                    sizes="120px"
                    locked={prompt.locked}
                    category={prompt.categorySlug}
                  />
                </div>
              ))}
            </div>
          )}

          <dl className="card mt-3 grid grid-cols-3 divide-x divide-[var(--border-subtle)] p-0 text-center">
            <Stat icon={<EyeIcon size={15} />} label="Views" value={prompt.viewCount} />
            <Stat icon={<CopyIcon size={15} />} label="Copies" value={prompt.copyCount} />
            <Stat icon={<HeartIcon size={15} />} label="Likes" value={prompt.likeCount} />
          </dl>
        </div>

        {/* Content column */}
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <ModelBadge model={prompt.aiModel} />
            <Badge tone="neutral">{prompt.categoryName}</Badge>
            <DifficultyBadge level={prompt.difficulty} />
            {prompt.isPremium ? <PremiumBadge /> : <Badge tone="success">Free</Badge>}
            {prompt.isTrending && <TrendingBadge />}
            {prompt.isEditorsPick && <EditorsPickBadge />}
          </div>

          <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">{prompt.title}</h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-body">
            {prompt.shortDescription}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-faint">
            <span>
              By{' '}
              <strong className="font-semibold text-[var(--text-primary)]">
                {prompt.authorName ?? 'promptduniya team'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>Published {formatDate(prompt.publishedAt ?? prompt.createdAt)}</span>
            {prompt.updatedAt > (prompt.publishedAt ?? prompt.createdAt) + 3600 && (
              <>
                <span aria-hidden="true">·</span>
                <span>Updated {relativeTime(prompt.updatedAt)}</span>
              </>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <FavoriteButton
              promptId={prompt.id}
              initialSaved={prompt.savedByMe}
              showLabel
              className="border border-[var(--border-strong)] px-4"
            />
            <LikeButton
              promptId={prompt.id}
              initialLiked={prompt.likedByMe}
              initialCount={prompt.likeCount}
              className="border border-[var(--border-strong)] px-4"
            />
            <ShareButton
              title={prompt.title}
              path={path}
              description={prompt.shortDescription}
            />
          </div>

          {/* Deliberately ABOVE the prompt body, and outside the paywall.
              PromptViewer renders its own "how to use" card from
              `usageInstructions`, but that card is inside the locked gate — so a
              visitor looking at a premium prompt saw a blurred box and no
              explanation of what the prompt even does. Whether you need to
              upload a photo is not the secret being sold; the prompt text is. */}
          <section className="mt-7" aria-labelledby="howto-heading">
            <div className="card p-5">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300"
                >
                  {mode.id === 'photo-edit' ? <CameraIcon size={17} /> : <SparkleIcon size={17} />}
                </span>
                <div className="min-w-0">
                  <h2 id="howto-heading" className="text-base font-bold">
                    {mode.label}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-body">{mode.note}</p>
                </div>
              </div>

              <ol className="mt-4 grid gap-2.5">
                {mode.steps.map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm leading-relaxed">
                    <span
                      aria-hidden="true"
                      className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--surface-sunken)] text-[0.625rem] font-bold tabular-nums text-body"
                    >
                      {index + 1}
                    </span>
                    <span className="text-body">{step}</span>
                  </li>
                ))}
              </ol>

              {prompt.aspectRatio && (
                <p className="mt-4 border-t border-[var(--border-subtle)] pt-3 text-xs text-faint">
                  Built for{' '}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {prompt.aspectRatio}
                  </span>{' '}
                  and written for{' '}
                  <span className="font-semibold text-[var(--text-primary)]">{model.label}</span>.
                </p>
              )}
            </div>
          </section>

          <section className="mt-7" aria-labelledby="prompt-heading">
            <h2 id="prompt-heading" className="mb-3 text-lg font-extrabold">
              Prompt
            </h2>
            <PromptViewer
              promptId={prompt.id}
              slug={prompt.slug}
              title={prompt.title}
              promptText={prompt.promptText}
              negativePrompt={prompt.negativePrompt}
              usageInstructions={prompt.usageInstructions}
              aiModel={prompt.aiModel}
              locked={prompt.locked}
              isAuthenticated={access.isAuthenticated}
            />
          </section>

          <section className="mt-8" aria-labelledby="specs-heading">
            <h2 id="specs-heading" className="mb-3 text-base font-bold">
              Prompt details
            </h2>
            <dl className="card grid grid-cols-2 gap-x-6 gap-y-3.5 p-5 sm:grid-cols-3">
              {specs.map((spec) => (
                <div key={spec.label}>
                  <dt className="text-[0.6875rem] font-bold uppercase tracking-wider text-faint">
                    {spec.label}
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium capitalize">{spec.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {prompt.tags.length > 0 && (
            <section className="mt-7" aria-labelledby="tags-heading">
              <h2 id="tags-heading" className="mb-3 text-base font-bold">
                Tags
              </h2>
              <div className="flex flex-wrap gap-2">
                {prompt.tags.map((tag) => (
                  <Link
                    key={tag.slug}
                    href={`/explore?tag=${tag.slug}`}
                    className="rounded-full bg-[var(--surface-sunken)] px-3 py-1.5 text-xs font-semibold text-body transition-colors hover:text-brand-600"
                  >
                    #{tag.name}
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="mt-8" aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="mb-3 text-base font-bold">
              Frequently asked
            </h2>
            <div className="grid gap-2.5">
              {faqs.map((faq) => (
                <details key={faq.question} className="card group p-4">
                  <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">
                    <span className="flex items-center justify-between gap-3">
                      {faq.question}
                      <span
                        aria-hidden="true"
                        className="shrink-0 text-faint transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="mt-2.5 text-sm leading-relaxed text-body">{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Internal linking blocks */}
      {related.related.length > 0 && (
        <section className="mt-16">
          <SectionHeader
            title="Related prompts"
            description={`Similar looks in ${prompt.categoryName.toLowerCase()}`}
          />
          <PromptGrid
            prompts={related.related}
            canSeePremium={premiumVisible}
            priorityCount={0}
          />
        </section>
      )}

      {related.sameCategory.length > 0 && (
        <section className="mt-14">
          <SectionHeader
            title={`More from ${prompt.categoryName}`}
            action={{ label: 'View category', href: `/category/${prompt.categorySlug}` }}
          />
          <PromptGrid
            prompts={related.sameCategory}
            canSeePremium={premiumVisible}
            priorityCount={0}
          />
        </section>
      )}

      {related.sameModel.length > 0 && (
        <section className="mt-14">
          <SectionHeader
            title={`More ${model.label} prompts`}
            action={{ label: 'View all', href: `/explore?model=${prompt.aiModel}` }}
          />
          <PromptGrid
            prompts={related.sameModel}
            canSeePremium={premiumVisible}
            priorityCount={0}
          />
        </section>
      )}

      {related.trending.length > 0 && (
        <section className="mt-14">
          <SectionHeader
            title="Trending right now"
            action={{ label: 'See trending', href: '/explore?sort=trending' }}
          />
          <PromptGrid
            prompts={related.trending}
            canSeePremium={premiumVisible}
            priorityCount={0}
          />
        </section>
      )}

      {popular.length > 0 && (
        <section className="mt-14 border-t border-[var(--border-subtle)] pt-7">
          <h2 className="text-base font-bold">Popular searches</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {popular.map((item) => (
              <Link
                key={item.term}
                href={`/search?q=${encodeURIComponent(item.term)}`}
                className="rounded-full border border-[var(--border-subtle)] px-3.5 py-2 text-xs font-semibold text-body transition-colors hover:border-brand-400 hover:text-brand-600"
              >
                {item.term}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="px-3 py-3.5">
      <dt className="flex items-center justify-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-faint">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-lg font-extrabold tabular-nums">{formatCompact(value)}</dd>
    </div>
  );
}
