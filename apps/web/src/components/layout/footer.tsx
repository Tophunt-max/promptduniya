import Link from 'next/link';

import { AI_MODELS } from '@/lib/constants';
import type { BrandConfig } from '@/services/settings';
import type { CategorySummary } from '@/services/categories';
import { Logo } from '../brand/logo';
import { ThemeSwitcher } from '../theme/theme-provider';
import { InstagramIcon, MailIcon, TelegramIcon, XIcon, YoutubeIcon } from '../ui/icon';

/**
 * Footer.
 *
 * Doubles as an internal-linking surface: live categories and AI models are
 * rendered from the database so every listing page is reachable within two
 * clicks from anywhere on the site.
 */

export function Footer({
  brand,
  categories = [],
}: {
  brand: BrandConfig;
  categories?: CategorySummary[];
}) {
  const year = new Date().getFullYear();
  const topCategories = categories.slice(0, 8);

  const socials = [
    { href: brand.social.instagram, label: 'Instagram', icon: <InstagramIcon size={17} /> },
    { href: brand.social.x, label: 'X', icon: <XIcon size={17} /> },
    { href: brand.social.youtube, label: 'YouTube', icon: <YoutubeIcon size={17} /> },
    { href: brand.social.telegram, label: 'Telegram', icon: <TelegramIcon size={17} /> },
  ].filter((social) => social.href);

  return (
    <footer className="mt-8 border-t border-[var(--border-subtle)] bg-[var(--surface-raised)]">
      <div className="container-page py-10 sm:py-14">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo size={34} tagline={brand.tagline} />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-body">
              An India-first library of AI image prompts, plus a generator that writes
              production-ready prompts for the model you actually use.
            </p>

            {socials.length > 0 && (
              <div className="mt-5 flex items-center gap-1.5">
                {socials.map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="grid size-9 place-items-center rounded-full border border-[var(--border-subtle)] text-body transition-colors hover:border-brand-400 hover:text-brand-600"
                  >
                    {social.icon}
                  </a>
                ))}
              </div>
            )}

            {brand.contactEmail && (
              <a
                href={`mailto:${brand.contactEmail}`}
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-body transition-colors hover:text-brand-600"
              >
                <MailIcon size={16} />
                {brand.contactEmail}
              </a>
            )}
          </div>

          <FooterColumn title="Explore">
            <FooterLink href="/explore">All prompts</FooterLink>
            <FooterLink href="/explore?sort=trending">Trending</FooterLink>
            <FooterLink href="/explore?sort=newest">Latest</FooterLink>
            <FooterLink href="/explore?access=free">Free prompts</FooterLink>
            <FooterLink href="/explore?access=premium">Premium prompts</FooterLink>
            <FooterLink href="/categories">Categories</FooterLink>
            <FooterLink href="/blog">Guides</FooterLink>
          </FooterColumn>

          <FooterColumn title="Create">
            <FooterLink href="/generator">Prompt generator</FooterLink>
            <FooterLink href="/random-prompt">Random prompt</FooterLink>
            <FooterLink href="/premium">Premium plans</FooterLink>
            <FooterLink href="/dashboard">Dashboard</FooterLink>
            <FooterLink href="/favorites">Favourites</FooterLink>
            {AI_MODELS.slice(0, 3).map((model) => (
              <FooterLink key={model.id} href={`/explore?model=${model.id}`}>
                {model.label} prompts
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn title="Company">
            <FooterLink href="/about">About</FooterLink>
            <FooterLink href="/contact">Contact</FooterLink>
            <FooterLink href="/privacy">Privacy policy</FooterLink>
            <FooterLink href="/terms">Terms of service</FooterLink>
            <FooterLink href="/refund-policy">Refund policy</FooterLink>
            <FooterLink href="/cookies">Cookie policy</FooterLink>
            <FooterLink href="/disclaimer">Disclaimer</FooterLink>
          </FooterColumn>
        </div>

        {topCategories.length > 0 && (
          <div className="mt-9 border-t border-[var(--border-subtle)] pt-6">
            <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-faint">
              Popular categories
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {topCategories.map((category) => (
                <Link
                  key={category.id}
                  href={`/category/${category.slug}`}
                  className="text-sm text-body transition-colors hover:text-brand-600"
                >
                  {category.name} prompts
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-col-reverse items-start justify-between gap-4 border-t border-[var(--border-subtle)] pt-6 sm:flex-row sm:items-center">
          <div className="text-xs text-faint">
            <p>
              © {year} {brand.name}. All rights reserved.
            </p>
            <p className="mt-1.5 max-w-xl leading-relaxed">
              Prompt text is written by our team. Model names are trademarks of their respective
              owners and are referenced only to indicate which tool a prompt was written for — we
              are not affiliated with, or endorsed by, any AI provider.
            </p>
          </div>
          <ThemeSwitcher />
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <nav aria-label={title}>
      <h2 className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-faint">
        {title}
      </h2>
      <ul className="grid gap-2">{children}</ul>
    </nav>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-sm text-body transition-colors hover:text-brand-600">
        {children}
      </Link>
    </li>
  );
}
