import Link from 'next/link';

import { formatCompact } from '@/lib/utils';
import { SearchBar } from '../search/search-bar';
import { ButtonLink } from '../ui/button';
import { ArrowRightIcon, SparkleIcon } from '../ui/icon';

/**
 * Hero.
 *
 * The backdrop is built entirely from CSS gradients and SVG (see `.hero-mesh`
 * in globals.css) — it costs no image bytes, works in both themes, and avoids
 * using any third-party or copyrighted photography.
 *
 * Deliberately short. The previous version stacked seven blocks — pill,
 * headline, sub-copy, search, two buttons, three stat cards and a row of model
 * pills — which filled the whole first viewport on a laptop and pushed every
 * actual prompt below the fold. On a catalogue site the product *is* the grid,
 * so the hero's job is to get out of the way quickly:
 *
 *   - the stats are one inline row instead of three bordered cards
 *   - the "prompts written for" model pills are gone; the home page already has
 *     a dedicated "browse by AI model" section further down, so they were a
 *     straight duplicate
 *   - vertical padding is roughly a third lower at every breakpoint
 *
 * Net effect: the trending grid starts before the fold on a 900px viewport.
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

      <div className="container-page relative py-9 sm:py-11 lg:py-14">
        <div className="mx-auto max-w-3xl text-center">
          <Link
            href="/random-prompt"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)]/85 px-3.5 py-1.5 text-xs font-semibold shadow-[var(--shadow-soft)] backdrop-blur transition-colors hover:border-brand-400"
          >
            <SparkleIcon size={14} className="text-marigold-500" />
            New: instant random prompt generator
            <ArrowRightIcon size={13} />
          </Link>

          <h1 className="mt-5 text-[2.125rem] font-extrabold leading-[1.05] sm:text-5xl lg:text-[3.5rem]">
            AI photo prompts that
            <br className="hidden sm:block" />{' '}
            <span className="gradient-text">actually work</span>
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-body sm:text-lg">
            Copy-paste prompts for Gemini, ChatGPT and Midjourney — including photo-editing prompts
            that keep your own face and rebuild everything around it.
          </p>

          <div className="mx-auto mt-7 max-w-2xl">
            <SearchBar
              size="lg"
              popularSearches={popularSearches}
              placeholder="Search prompts, styles, categories…"
            />
          </div>

          <div className="mt-5 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
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

          {/* One inline row, divided rather than boxed — carries the same three
              numbers in about a quarter of the vertical space. */}
          <dl className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm sm:gap-x-8">
            <HeroStat label="prompts" value={formatCompact(promptCount)} />
            <Divider />
            <HeroStat label="categories" value={String(categoryCount)} />
            <Divider />
            <HeroStat label="copies taken" value={formatCompact(copyCount)} />
          </dl>
        </div>
      </div>
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dd className="text-lg font-extrabold tabular-nums">{value}</dd>
      <dt className="text-[0.8125rem] font-medium text-faint">{label}</dt>
    </div>
  );
}

function Divider() {
  return <span aria-hidden="true" className="hidden size-1 rounded-full bg-[var(--border-strong)] sm:block" />;
}
