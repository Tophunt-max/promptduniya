import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage } from '@/components/legal/legal-page';
import { buildMetadata } from '@/lib/seo';
import { getBrand } from '@/services/settings';

export const revalidate = 86400;

export const metadata: Metadata = buildMetadata({
  title: 'Terms of service',
  description: 'The terms that apply when you use promptduniya, including accounts, memberships and acceptable use.',
  path: '/terms',
});

const UPDATED = Math.floor(Date.parse('2026-08-01T00:00:00Z') / 1000);

export default async function TermsPage() {
  const brand = await getBrand();

  return (
    <LegalPage
      title="Terms of service"
      intro="These terms apply whenever you use promptduniya. By creating an account or using the site you agree to them."
      updatedAt={UPDATED}
      contactEmail={brand.contactEmail}
      sections={[
        {
          heading: 'The service',
          body: (
            <p>
              promptduniya is a library of text prompts for AI image generation tools, together with
              a generator that composes new prompts from a structured brief. We provide the prompt
              text. We do not generate images ourselves, and we are not affiliated with, endorsed by,
              or acting as an agent for any AI provider. Model names are referenced only to indicate
              which tool a prompt was written for.
            </p>
          ),
        },
        {
          heading: 'Your account',
          body: (
            <>
              <p>
                You are responsible for keeping your password secure and for activity that happens
                under your account. Please tell us promptly if you think it has been compromised.
              </p>
              <p>
                One account per person. Do not share credentials, and do not create accounts to work
                around plan limits.
              </p>
            </>
          ),
        },
        {
          heading: 'Using the prompts',
          body: (
            <>
              <p>
                You may use, adapt and build on the prompt text for personal and commercial projects.
                You do not need to credit us, though it is appreciated.
              </p>
              <p>You may not:</p>
              <ul>
                <li>Republish our library, in whole or in substantial part, as your own</li>
                <li>Scrape the site or use automated tools to bulk-download prompts</li>
                <li>Resell access to premium prompts, or share a premium account</li>
              </ul>
              <p>
                Rights over the <em>images</em> you generate are governed entirely by the terms of
                the AI tool you run the prompt in. Check that provider&rsquo;s licence — we cannot
                grant rights over their output.
              </p>
            </>
          ),
        },
        {
          heading: 'Acceptable use',
          body: (
            <>
              <p>Do not use this service to create or seek prompts intended to:</p>
              <ul>
                <li>Sexualise or endanger minors, in any way</li>
                <li>Produce non-consensual intimate imagery, or sexual content of real people</li>
                <li>Impersonate a real person, or generate deceptive imagery of them</li>
                <li>Harass, threaten, or incite violence or hatred against any group</li>
                <li>Break the law, or facilitate fraud or deception</li>
              </ul>
              <p>
                We remove content and suspend accounts that breach this, and we do so without refund
                where the breach is deliberate.
              </p>
            </>
          ),
        },
        {
          heading: 'Plans, limits and payments',
          body: (
            <>
              <p>
                Free accounts have daily limits on prompt copies and generator runs, and a cap on
                saved favourites. Current figures are shown on the{' '}
                <Link href="/premium">premium page</Link> and in your dashboard. We may adjust these
                limits; if we reduce them materially for paying members we will give notice.
              </p>
              <p>
                Prices are shown in Indian Rupees. The amount displayed on the payment screen is the
                amount charged. Subscription plans renew automatically unless you turn off
                auto-renewal; the lifetime plan is a single payment with no renewals.
              </p>
              <p>
                See the <Link href="/refund-policy">refund policy</Link> for cancellations and
                refunds.
              </p>
            </>
          ),
        },
        {
          heading: 'Availability',
          body: (
            <p>
              We aim to keep the service running reliably, but we do not promise uninterrupted
              availability. We may carry out maintenance, change features, or discontinue parts of
              the service. If we discontinue a paid feature you have already paid for, we will offer
              a pro-rata refund for the unused period.
            </p>
          ),
        },
        {
          heading: 'Content you submit',
          body: (
            <p>
              If you submit content — a report, a message, or prompt content once creator submissions
              are enabled — you confirm you have the right to do so, and you grant us permission to
              store and display it as needed to operate the service. You keep ownership of what you
              write.
            </p>
          ),
        },
        {
          heading: 'Liability',
          body: (
            <>
              <p>
                The service is provided as-is. Image models are non-deterministic: the same prompt
                will produce different results each run, and results vary between models and
                versions. We cannot guarantee any specific output.
              </p>
              <p>
                To the extent permitted by law, our total liability to you is limited to the amount
                you paid us in the twelve months before the claim arose.
              </p>
            </>
          ),
        },
        {
          heading: 'Ending your use',
          body: (
            <p>
              You can stop using the service and ask us to delete your account at any time. We may
              suspend or close an account that breaches these terms, and we will explain why unless
              doing so would be unlawful or unsafe.
            </p>
          ),
        },
        {
          heading: 'Changes and governing law',
          body: (
            <p>
              We may update these terms; the date at the top of this page reflects the latest
              revision, and material changes are notified to account holders. These terms are
              governed by the laws of India, and the courts of India have jurisdiction over any
              dispute.
            </p>
          ),
        },
      ]}
    />
  );
}
