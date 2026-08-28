import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { ButtonLink } from '@/components/ui/button';
import { CompassIcon, SearchIcon, SparkleIcon } from '@/components/ui/icon';

export const metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

/** 404. Offers three genuinely useful routes onward rather than a dead end. */
export default function NotFound() {
  const suggestions = [
    {
      href: '/explore',
      icon: <CompassIcon size={18} />,
      title: 'Explore prompts',
      body: 'Browse the full library by category, model and style.',
    },
    {
      href: '/generator',
      icon: <SparkleIcon size={18} />,
      title: 'Generate a prompt',
      body: 'Describe what you want and get a ready-to-use prompt.',
    },
    {
      href: '/search',
      icon: <SearchIcon size={18} />,
      title: 'Search',
      body: 'Look for a prompt by title, tag or keyword.',
    },
  ];

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-12 text-center">
      <div aria-hidden="true" className="hero-mesh opacity-70" />
      <div aria-hidden="true" className="hero-grid opacity-40" />

      <div className="relative w-full max-w-2xl">
        <Logo size={38} href="/" className="mx-auto mb-10" />

        <p className="text-[5rem] font-black leading-none tracking-tighter gradient-text sm:text-[7rem]">
          404
        </p>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">This page doesn&rsquo;t exist</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-body">
          The link may be out of date, or the prompt may have been unpublished. Here are a few places
          worth trying instead.
        </p>

        <div className="mt-8 grid gap-2.5 sm:grid-cols-3">
          {suggestions.map((item) => (
            <Link key={item.href} href={item.href} className="card card-hover group p-4 text-left">
              <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
                {item.icon}
              </span>
              <p className="mt-3 text-sm font-bold group-hover:text-brand-600 dark:group-hover:text-brand-300">
                {item.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-faint">{item.body}</p>
            </Link>
          ))}
        </div>

        <div className="mt-8">
          <ButtonLink href="/">Back to home</ButtonLink>
        </div>
      </div>
    </div>
  );
}
