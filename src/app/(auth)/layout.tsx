import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { ThemeToggleButton } from '@/components/theme/theme-provider';
import { publicEnv } from '@/lib/env-public';
import { CheckIcon } from '@/components/ui/icon';

/**
 * Split-screen shell for authentication pages.
 *
 * The marketing panel is hidden below `lg` so the form is the only thing on
 * screen on a phone — no scrolling past decoration to reach the inputs.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const points = [
    'Thirty-plus original prompts, with more added every week',
    'Written and labelled for the model you actually use',
    'One-tap copy, with negative prompts where they matter',
    'A generator that writes prompts around your own idea',
  ];

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Form column */}
      <div className="relative flex flex-col px-5 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <Logo size={32} />
          <ThemeToggleButton />
        </div>

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-sm">{children}</div>
        </div>

        <p className="text-center text-xs text-faint">
          <Link href="/" className="hover:text-brand-600">
            Back to {publicEnv.siteName}
          </Link>
          <span aria-hidden="true" className="mx-2">
            ·
          </span>
          <Link href="/privacy" className="hover:text-brand-600">
            Privacy
          </Link>
          <span aria-hidden="true" className="mx-2">
            ·
          </span>
          <Link href="/terms" className="hover:text-brand-600">
            Terms
          </Link>
        </p>
      </div>

      {/* Marketing column */}
      <aside className="relative hidden overflow-hidden lg:block">
        <div aria-hidden="true" className="hero-mesh" />
        <div aria-hidden="true" className="hero-grid opacity-50" />
        <div className="relative flex h-full flex-col justify-center px-12 xl:px-16">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-brand-600 dark:text-brand-300">
            {publicEnv.tagline}
          </p>
          <h2 className="mt-4 max-w-md text-3xl font-extrabold leading-tight xl:text-4xl">
            Better prompts, <span className="gradient-text">better images.</span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-body">
            An India-first prompt library built by people who actually run these models — every
            prompt names its light source, its lens and the model it was tested on.
          </p>

          <ul className="mt-8 grid max-w-md gap-3">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                  <CheckIcon size={12} />
                </span>
                <span className="text-body">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
