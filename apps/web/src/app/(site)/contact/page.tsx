import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { ContactForm } from '@/components/legal/contact-form';
import { JsonLd } from '@/components/seo/json-ld';
import { MailIcon, ShieldIcon, SparkleIcon } from '@/components/ui/icon';
import { breadcrumbSchema, buildMetadata } from '@/lib/seo';
import { getBrand } from '@/services/settings';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Contact us',
  description:
    'Questions about your membership, a billing issue, or a prompt request? Send us a message and we will reply within two working days.',
  path: '/contact',
});

export default async function ContactPage() {
  const brand = await getBrand();

  return (
    <div className="container-page py-8 sm:py-12">
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Contact', path: '/contact' },
        ])}
      />

      <div className="mx-auto max-w-5xl">
        <header className="mb-8 max-w-2xl">
          <h1 className="text-2xl font-extrabold sm:text-3xl">Get in touch</h1>
          <p className="mt-2 text-sm leading-relaxed text-body">
            Billing questions, prompt requests, corrections, or anything else — we read every message
            and reply within two working days.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
          <Suspense fallback={null}>
            <ContactForm />
          </Suspense>

          <aside className="grid content-start gap-3">
            {brand.contactEmail && (
              <div className="card p-5">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
                  <MailIcon size={19} />
                </span>
                <h2 className="mt-3.5 text-sm font-bold">Email us directly</h2>
                <a
                  href={`mailto:${brand.contactEmail}`}
                  className="mt-1 block break-all text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300"
                >
                  {brand.contactEmail}
                </a>
              </div>
            )}

            <div className="card p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-marigold-50 text-marigold-600 dark:bg-marigold-900/40 dark:text-marigold-300">
                <ShieldIcon size={19} />
              </span>
              <h2 className="mt-3.5 text-sm font-bold">Billing or payment issue?</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-body">
                Include the receipt number from{' '}
                <Link
                  href="/dashboard/billing"
                  className="font-semibold text-brand-600 underline dark:text-brand-300"
                >
                  Premium and billing
                </Link>{' '}
                and we can look it up immediately.
              </p>
              <Link
                href="/refund-policy"
                className="mt-2.5 inline-block text-xs font-bold text-brand-600 hover:underline dark:text-brand-300"
              >
                Read the refund policy
              </Link>
            </div>

            <div className="card p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-300">
                <SparkleIcon size={19} />
              </span>
              <h2 className="mt-3.5 text-sm font-bold">Want a specific prompt?</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-body">
                Tell us the look you are after — subject, setting, mood — and which model you use.
                Requests genuinely shape what we publish next.
              </p>
            </div>

            <p className="px-1 text-xs leading-relaxed text-faint">
              We do not publish personal email addresses on this site. Messages sent through this
              form go to our internal inbox, and we keep them only as long as needed to resolve your
              query.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
