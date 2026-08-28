import type { Metadata } from 'next';
import Link from 'next/link';

import { GeneratorForm } from '@/components/generator/generator-form';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { DiceIcon } from '@/components/ui/icon';
import { aiConfigured } from '@/lib/env';
import { breadcrumbSchema, buildMetadata, faqSchema } from '@/lib/seo';
import { getAccess } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'AI prompt generator',
  description:
    'Build a production-ready AI image prompt in seconds. Choose your model, subject, styling, lighting and camera — we write it in the grammar that model expects.',
  path: '/generator',
  keywords: ['ai prompt generator', 'image prompt generator', 'midjourney prompt generator'],
});

const FAQS = [
  {
    question: 'Do I need an API key to use the generator?',
    answer:
      'No. The generator ships with a template engine that composes prompts locally, so it works without any external service. If the site operator configures an AI provider, premium members can opt into that instead.',
  },
  {
    question: 'Why does the same brief produce different wording for each model?',
    answer:
      'Because the models parse text differently. Midjourney takes comma-separated clauses with trailing flags, Stable Diffusion and Flux use weighted keyword stacks, and Gemini and ChatGPT respond best to structured natural language.',
  },
  {
    question: 'Can I leave fields blank?',
    answer:
      'Yes — every field except the model is optional. Anything you leave empty gets a sensible default chosen to suit the image type you picked.',
  },
];

export default async function GeneratorPage() {
  const access = await getAccess();
  const aiAvailable = aiConfigured();

  return (
    <div className="container-page py-8 sm:py-12">
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Generator', path: '/generator' },
        ])}
      />
      <JsonLd data={faqSchema(FAQS)} />

      <header className="mb-8 max-w-3xl">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone="brand">Generator</Badge>
          <Badge tone={aiAvailable ? 'peacock' : 'neutral'}>
            {aiAvailable ? 'AI engine available' : 'Template engine'}
          </Badge>
          {!access.isAuthenticated && (
            <Badge tone="marigold">
              {access.limits.generatorPerDay} free runs per day
            </Badge>
          )}
        </div>

        <h1 className="text-2xl font-extrabold sm:text-4xl">AI prompt generator</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-body">
          Describe what you want and we assemble a complete prompt — with a matching negative prompt
          and practical tips — written in the grammar your chosen model actually responds to.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <ButtonLink
            href="/random-prompt"
            variant="outline"
            leadingIcon={<DiceIcon size={17} />}
          >
            Or roll a random prompt
          </ButtonLink>
          {!access.isAuthenticated && (
            <Link
              href="/register"
              className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300"
            >
              Create a free account for more runs
            </Link>
          )}
        </div>
      </header>

      <GeneratorForm aiAvailable={aiAvailable} />

      <section className="mt-16 border-t border-[var(--border-subtle)] pt-8" aria-labelledby="gen-faq">
        <h2 id="gen-faq" className="text-lg font-extrabold">
          Frequently asked
        </h2>
        <div className="mt-4 grid gap-2.5 lg:grid-cols-3">
          {FAQS.map((faq) => (
            <div key={faq.question} className="card p-5">
              <h3 className="text-sm font-bold">{faq.question}</h3>
              <p className="mt-2 text-sm leading-relaxed text-body">{faq.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
