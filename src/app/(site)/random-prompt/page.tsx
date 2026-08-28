import type { Metadata } from 'next';

import { RandomGenerator } from '@/components/generator/random-generator';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { SparkleIcon } from '@/components/ui/icon';
import { breadcrumbSchema, buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Random AI prompt generator',
  description:
    'Roll a complete random AI image prompt — category, style, subject, location, mood, camera and lighting all chosen for you. Copy, save or roll again.',
  path: '/random-prompt',
  keywords: ['random ai prompt', 'random prompt generator', 'ai image prompt ideas'],
});

export default function RandomPromptPage() {
  return (
    <div className="container-page py-8 sm:py-12">
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Random prompt', path: '/random-prompt' },
        ])}
      />

      <header className="mb-8 max-w-3xl">
        <Badge tone="marigold" className="mb-3">
          Feeling stuck?
        </Badge>
        <h1 className="text-2xl font-extrabold sm:text-4xl">Random prompt generator</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-body">
          One click rolls an entire brief — a random category, style, subject, location, mood, camera
          and lighting setup — and writes it up as a finished prompt. Keep rolling until something
          sparks.
        </p>
        <div className="mt-5">
          <ButtonLink
            href="/generator"
            variant="outline"
            leadingIcon={<SparkleIcon size={17} />}
          >
            Prefer full control? Use the advanced generator
          </ButtonLink>
        </div>
      </header>

      <RandomGenerator />
    </div>
  );
}
