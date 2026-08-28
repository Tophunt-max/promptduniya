import type { Metadata } from 'next';
import Link from 'next/link';

import { JsonLd } from '@/components/seo/json-ld';
import { SectionHeader } from '@/components/prompt/prompt-grid';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { CameraIcon, PaletteIcon, ShieldIcon, SparkleIcon } from '@/components/ui/icon';
import { breadcrumbSchema, buildMetadata } from '@/lib/seo';
import { formatCompact } from '@/lib/utils';
import { platformStats } from '@/services/analytics';
import { listCategories } from '@/services/categories';

export const revalidate = 3600;

export const metadata: Metadata = buildMetadata({
  title: 'About promptduniya',
  description:
    'Why we built an India-first AI prompt library, how prompts are written and tested, and what we promise about the images you make with them.',
  path: '/about',
});

export default async function AboutPage() {
  const [stats, categories] = await Promise.all([
    platformStats().catch(() => null),
    listCategories().catch(() => []),
  ]);

  const principles = [
    {
      icon: <CameraIcon size={20} />,
      title: 'Written like a shot list',
      body: 'Every prompt names a light source and its direction, a focal length and aperture, a material rather than just a garment, and one explicit technical constraint. That is what separates a usable prompt from a wish.',
    },
    {
      icon: <PaletteIcon size={20} />,
      title: 'Specific, not generic',
      body: '“Traditional Indian clothing” gives a model nothing. A deep indigo handloom cotton saree with a mustard temple border gives it four facts it can actually render. We always choose the second.',
    },
    {
      icon: <SparkleIcon size={20} />,
      title: 'Matched to the model',
      body: 'Midjourney wants comma clauses and trailing flags. Flux and Stable Diffusion want weighted keyword stacks. Gemini and ChatGPT want structured prose. We write each prompt in the grammar its target model responds to.',
    },
    {
      icon: <ShieldIcon size={20} />,
      title: 'Honest about limits',
      body: 'Image models are non-deterministic and results vary. We tell you which model a prompt was tested on, note the failure modes we hit, and never claim compatibility we have not checked.',
    },
  ];

  return (
    <div className="container-page py-8 sm:py-12">
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'About', path: '/about' },
        ])}
      />

      <header className="mx-auto mb-12 max-w-3xl text-center">
        <Badge tone="brand" className="mb-3">
          About us
        </Badge>
        <h1 className="text-3xl font-extrabold sm:text-4xl">
          Prompts written by people who <span className="gradient-text">actually run the models</span>
        </h1>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-body sm:text-base">
          Most prompt libraries are keyword soup — long strings of adjectives that produce a
          plausible-looking average. We started promptduniya because we wanted the opposite: prompts
          that read like a photographer&rsquo;s brief, and that carry enough Indian specificity to
          look like somewhere real.
        </p>
      </header>

      {stats && (
        <dl className="mx-auto mb-14 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
          <StatBlock label="Published prompts" value={formatCompact(stats.publishedPrompts)} />
          <StatBlock label="Categories" value={String(categories.length)} />
          <StatBlock label="Prompts copied" value={formatCompact(stats.promptCopies)} />
          <StatBlock label="Generator runs" value={formatCompact(stats.generatorRuns)} />
        </dl>
      )}

      <section className="mb-14">
        <SectionHeader
          eyebrow="How we work"
          title="Four principles"
          description="These are the rules we hold ourselves to on every prompt we publish."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {principles.map((principle) => (
            <div key={principle.title} className="card p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
                {principle.icon}
              </span>
              <h3 className="mt-3.5 text-base font-bold">{principle.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-body">{principle.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-14">
        <SectionHeader eyebrow="Where we stand" title="A few clear commitments" />
        <div className="prose-article max-w-3xl">
          <h3>We write our own content</h3>
          <p>
            Every prompt, guide and description on this site is written for promptduniya. We do not
            scrape other prompt sites, and we do not republish other people&rsquo;s work as our own.
            Cover visuals are generated as original CSS and SVG compositions rather than stock or
            scraped photography.
          </p>

          <h3>We are independent</h3>
          <p>
            We are not affiliated with, endorsed by, or acting for any AI provider. Model names appear
            on this site only to tell you which tool a prompt was written for. See our{' '}
            <Link href="/disclaimer">disclaimer</Link> for the full position.
          </p>

          <h3>Free is genuinely usable</h3>
          <p>
            A free account gets the whole library, full search and filtering, a real daily allowance
            of copies, and the generator. Premium removes the caps and unlocks the premium
            collection — it does not unlock the basics. Current limits are always visible on your{' '}
            <Link href="/dashboard">dashboard</Link>.
          </p>

          <h3>We collect very little</h3>
          <p>
            No advertising trackers, no third-party analytics, no raw IP addresses. We keep
            aggregated day-level counts so we can tell which prompts are useful, and that is about
            it. The <Link href="/privacy">privacy policy</Link> spells out every field.
          </p>

          <h3>We say what does not work</h3>
          <p>
            Prompts fail in predictable ways: hands, fabric texture, mehndi across knuckles, matched
            lighting on two faces. Rather than pretend otherwise, our prompts include the negative
            prompts and setup notes that address those specific failures — and our guides explain
            why they happen.
          </p>
        </div>
      </section>

      <section className="card gradient-brand border-0 p-7 text-center text-white sm:p-10">
        <h2 className="text-2xl font-extrabold sm:text-3xl">Start with a prompt, not a blank box</h2>
        <p className="mx-auto mt-2.5 max-w-xl text-sm leading-relaxed text-white/85">
          Browse the library, or describe your idea and let the generator write the prompt around it.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <ButtonLink
            href="/explore"
            variant="secondary"
            className="bg-white text-brand-700 hover:bg-white/90 dark:bg-white dark:text-brand-700"
          >
            Explore prompts
          </ButtonLink>
          <ButtonLink
            href="/generator"
            variant="outline"
            className="border-white/30 bg-transparent text-white hover:border-white hover:text-white"
          >
            Open the generator
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4 text-center">
      <dd className="text-2xl font-extrabold tabular-nums">{value}</dd>
      <dt className="mt-0.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-faint">
        {label}
      </dt>
    </div>
  );
}
