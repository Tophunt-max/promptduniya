import Link from 'next/link';

import { AI_MODELS } from '@/lib/constants';
import { formatCompact } from '@/lib/utils';
import { SearchBar } from '../search/search-bar';
import { ButtonLink } from '../ui/button';
import { ArrowRightIcon, SparkleIcon } from '../ui/icon';

/**
 * Hero.
 *
 * The "collage" is built entirely from CSS gradients and SVG (see `.hero-mesh`
 * in globals.css) — it costs no image bytes, works in both themes, and avoids
 * using any third-party or copyrighted photography.
 */

export interface HeroProps {
  promptCount: number;
  categoryCount: number;
  copyCount: number;
  popularSearches?: string[];
}

export function Hero({ promptCount, categoryCount, copyCount, popularSearches = [] }: HeroProps) {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden="true" className="hero-mesh" />
      <div aria-hidden="true" className="hero-grid opacity-60" />

      <div className="container-page relative py-12 sm:py-16 lg:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <Link
            href="/random-prompt"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)]/85 px-3.5 py-1.5 text-xs font-semibold shadow-[var(--shadow-soft)] backdrop-blur transition-colors hover:border-brand-400"
          >
            <SparkleIcon size={14} className="text-marigold-500" />
            New: instant random prompt generator
            <ArrowRightIcon size={13} />
          </Link>

          <h1 className="mt-6 text-[2rem] font-extrabold leading-[1.08] sm:text-5xl lg:text-6xl">
            Create stunning AI images
            <br className="hidden sm:block" />{' '}
            <span className="gradient-text">with better prompts</span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-body sm:text-lg">
            Discover trending AI image prompts, create your own prompts, and transform your ideas
            into amazing visuals.
          </p>

          <div className="mx-auto mt-8 max-w-2xl">
            <SearchBar
              size="lg"
              popularSearches={popularSearches}
              placeholder="Search prompts, styles, categories…"
            />
          </div>

          <div className="mt-6 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <ButtonLink href="/explore" size="lg" className="w-full sm:w-auto">
              Explore prompts
            </ButtonLink>
            <ButtonLink
              href="/generator"
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
              leadingIcon={<SparkleIcon size={18} />}
            >
              Create prompt
            </ButtonLink>
          </div>

          <dl className="mx-auto mt-10 grid max-w-lg grid-cols-3 gap-3">
            <HeroStat label="Prompts" value={formatCompact(promptCount)} />
            <HeroStat label="Categories" value={String(categoryCount)} />
            <HeroStat label="Copies" value={formatCompact(copyCount)} />
          </dl>

          <div className="mt-9">
            <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-faint">
              Prompts written for
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {AI_MODELS.filter((model) => model.id !== 'other').map((model) => (
                <Link
                  key={model.id}
                  href={`/explore?model=${model.id}`}
                  className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)]/70 px-3 py-1.5 text-xs font-semibold text-body backdrop-blur transition-colors hover:border-brand-400 hover:text-brand-600"
                >
                  {model.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]/70 px-3 py-3 backdrop-blur">
      <dd className="text-xl font-extrabold tabular-nums sm:text-2xl">{value}</dd>
      <dt className="mt-0.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-faint">
        {label}
      </dt>
    </div>
  );
}
