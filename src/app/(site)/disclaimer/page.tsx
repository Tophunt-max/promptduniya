import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage } from '@/components/legal/legal-page';
import { buildMetadata } from '@/lib/seo';
import { getBrand } from '@/services/settings';

export const revalidate = 86400;

export const metadata: Metadata = buildMetadata({
  title: 'Disclaimer',
  description:
    'What promptduniya does and does not promise about AI-generated results, third-party tools and trademarks.',
  path: '/disclaimer',
});

const UPDATED = Math.floor(Date.parse('2026-08-01T00:00:00Z') / 1000);

export default async function DisclaimerPage() {
  const brand = await getBrand();

  return (
    <LegalPage
      title="Disclaimer"
      intro="Some plain statements about what this service is, what it isn't, and what you can reasonably expect."
      updatedAt={UPDATED}
      contactEmail={brand.contactEmail}
      sections={[
        {
          heading: 'We are not affiliated with any AI provider',
          body: (
            <p>
              promptduniya is an independent project. We are not affiliated with, endorsed by,
              sponsored by, or acting for Google, OpenAI, Midjourney, Black Forest Labs, Stability AI,
              Leonardo AI, Ideogram or any other AI company. Their names and trademarks belong to
              them, and we reference them only to indicate which tool a given prompt was written and
              tested for.
            </p>
          ),
        },
        {
          heading: 'Results will vary',
          body: (
            <>
              <p>
                Image models are non-deterministic. The same prompt produces a different image each
                run, and results differ between models, versions and account settings. A prompt that
                worked beautifully last month may behave differently after a model update.
              </p>
              <p>
                Our prompts are written and tested against a named model at a point in time. Treat
                them as a strong starting point, not a guarantee. Generating three or four variations
                and picking the best frame is normal practice, not a sign something is wrong.
              </p>
            </>
          ),
        },
        {
          heading: 'Rights over generated images',
          body: (
            <p>
              We grant you the right to use and adapt our <em>prompt text</em>. We cannot grant rights
              over the <em>images</em> you generate — those are governed entirely by the terms of the
              AI tool you run the prompt in. Check that provider&rsquo;s licence before using output
              commercially, particularly for advertising or print.
            </p>
          ),
        },
        {
          heading: 'Sample imagery on this site',
          body: (
            <p>
              Cover visuals in our library are generated as original CSS and SVG compositions, or are
              images we hold the rights to. We do not use scraped or copyrighted photography. If you
              believe any asset here infringes your rights, contact us and we will remove it while we
              investigate.
            </p>
          ),
        },
        {
          heading: 'Use AI responsibly',
          body: (
            <>
              <p>
                Our prompts describe fictional, generic subjects. They are not intended to depict real,
                identifiable people. Please do not use them to create imagery that impersonates
                someone, sexualises anyone, or misleads people about real events.
              </p>
              <p>
                Where you publish AI-generated imagery in a context that could be mistaken for
                photography — news, documentary, advertising claims — label it as AI-generated. It is
                the honest thing to do, and increasingly a legal requirement.
              </p>
            </>
          ),
        },
        {
          heading: 'No professional advice',
          body: (
            <p>
              Nothing on this site is legal, financial or professional advice. Our{' '}
              <Link href="/terms">terms</Link>, <Link href="/privacy">privacy policy</Link> and{' '}
              <Link href="/refund-policy">refund policy</Link> describe how we operate; if you are
              running a business on top of AI-generated content, take advice suited to your
              jurisdiction.
            </p>
          ),
        },
        {
          heading: 'External links',
          body: (
            <p>
              Where we link to third-party tools or documentation, we do so because it is useful. We
              do not control those sites and are not responsible for their content, availability or
              policies.
            </p>
          ),
        },
      ]}
    />
  );
}
