import Link from 'next/link';
import type { ReactNode } from 'react';

import { formatDate } from '@/lib/dates';

/**
 * Shared shell for legal and policy pages.
 *
 * Content is authored as structured sections rather than a blob of HTML, so it
 * stays readable, linkable and easy for an administrator to revise.
 */

export interface LegalSection {
  heading: string;
  body: ReactNode;
}

export function LegalPage({
  title,
  intro,
  updatedAt,
  sections,
  contactEmail,
}: {
  title: string;
  intro: string;
  updatedAt: number;
  sections: LegalSection[];
  contactEmail?: string;
}) {
  return (
    <div className="container-page py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-body">{intro}</p>
          <p className="mt-3 text-xs text-faint">Last updated {formatDate(updatedAt)}</p>
        </header>

        {sections.length > 3 && (
          <nav aria-label="On this page" className="card mb-8 p-5">
            <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-faint">
              On this page
            </h2>
            <ol className="grid gap-1.5 text-sm">
              {sections.map((section, index) => (
                <li key={section.heading}>
                  <a
                    href={`#section-${index + 1}`}
                    className="text-brand-600 hover:underline dark:text-brand-300"
                  >
                    {index + 1}. {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <div className="prose-article">
          {sections.map((section, index) => (
            <section key={section.heading} id={`section-${index + 1}`} className="scroll-mt-20">
              <h2>
                {index + 1}. {section.heading}
              </h2>
              {section.body}
            </section>
          ))}
        </div>

        <footer className="mt-10 border-t border-[var(--border-subtle)] pt-6">
          <p className="text-sm text-body">
            Questions about this page?{' '}
            <Link
              href="/contact"
              className="font-semibold text-brand-600 underline dark:text-brand-300"
            >
              Get in touch
            </Link>
            {contactEmail && (
              <>
                {' '}
                or email{' '}
                <a
                  href={`mailto:${contactEmail}`}
                  className="font-semibold text-brand-600 underline dark:text-brand-300"
                >
                  {contactEmail}
                </a>
              </>
            )}
            .
          </p>
          <p className="mt-3 text-xs leading-relaxed text-faint">
            This page is provided for transparency about how the service operates. It is not legal
            advice. If you operate this platform commercially, have these documents reviewed by a
            qualified professional in your jurisdiction before relying on them.
          </p>
        </footer>
      </div>
    </div>
  );
}
