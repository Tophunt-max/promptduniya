import type { Metadata } from 'next';

import { publicEnv } from './env-public';
import { truncate } from './utils';

/**
 * Metadata helpers.
 *
 * One place that builds titles, canonicals, Open Graph and Twitter cards so
 * every public page is consistent and no page ships a duplicate canonical.
 */

export const DEFAULT_DESCRIPTION =
  'Discover trending AI image prompts made for Indian creators, generate your own prompts in seconds, and turn everyday ideas into stunning visuals.';

export function absoluteUrl(path = '/'): string {
  const base = publicEnv.siteUrl.replace(/\/$/, '');
  return path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export interface PageSeoInput {
  title: string;
  description?: string;
  path: string;
  /** Absolute or site-relative image used for social cards. */
  image?: string | null;
  keywords?: string[];
  type?: 'website' | 'article';
  publishedTime?: string;
  modifiedTime?: string;
  noIndex?: boolean;
  authors?: string[];
}

export function buildMetadata(input: PageSeoInput): Metadata {
  const description = truncate(input.description ?? DEFAULT_DESCRIPTION, 300);
  const url = absoluteUrl(input.path);
  const image = input.image
    ? absoluteUrl(input.image)
    : absoluteUrl(`/api/og?title=${encodeURIComponent(truncate(input.title, 90))}`);

  return {
    title: input.title,
    description,
    keywords: input.keywords,
    alternates: { canonical: url },
    authors: input.authors?.map((name) => ({ name })),
    robots: input.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true, googleBot: { index: true, follow: true } },
    openGraph: {
      type: input.type ?? 'website',
      url,
      title: input.title,
      description,
      siteName: publicEnv.siteName,
      locale: 'en_IN',
      images: [{ url: image, width: 1200, height: 630, alt: input.title }],
      ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
      ...(input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: truncate(input.title, 70),
      description: truncate(description, 200),
      images: [image],
    },
  };
}

/* ------------------------------ JSON-LD blocks ----------------------------- */

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function breadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function organizationSchema(brand: { name: string; siteUrl: string; social: string[] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: brand.name,
    url: brand.siteUrl,
    logo: absoluteUrl('/icon.svg'),
    sameAs: brand.social.filter(Boolean),
  };
}

export function websiteSchema(brand: { name: string; siteUrl: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: brand.name,
    url: brand.siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${brand.siteUrl}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function creativeWorkSchema(input: {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  authorName?: string | null;
  datePublished?: number | null;
  dateModified?: number | null;
  keywords?: string[];
  isFree: boolean;
}) {
  const iso = (seconds?: number | null) =>
    seconds ? new Date(seconds * 1000).toISOString() : undefined;

  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: input.title,
    headline: input.title,
    description: input.description,
    url: absoluteUrl(input.path),
    ...(input.image ? { image: absoluteUrl(input.image) } : {}),
    inLanguage: 'en-IN',
    keywords: input.keywords?.join(', '),
    datePublished: iso(input.datePublished),
    dateModified: iso(input.dateModified) ?? iso(input.datePublished),
    author: { '@type': 'Organization', name: publicEnv.siteName },
    publisher: {
      '@type': 'Organization',
      name: publicEnv.siteName,
      logo: { '@type': 'ImageObject', url: absoluteUrl('/icon.svg') },
    },
    isAccessibleForFree: input.isFree,
  };
}

export function articleSchema(input: {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  authorName?: string | null;
  datePublished?: number | null;
  dateModified?: number | null;
}) {
  const iso = (seconds?: number | null) =>
    seconds ? new Date(seconds * 1000).toISOString() : undefined;

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    url: absoluteUrl(input.path),
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(input.path) },
    ...(input.image ? { image: absoluteUrl(input.image) } : {}),
    author: { '@type': input.authorName ? 'Person' : 'Organization', name: input.authorName ?? publicEnv.siteName },
    publisher: {
      '@type': 'Organization',
      name: publicEnv.siteName,
      logo: { '@type': 'ImageObject', url: absoluteUrl('/icon.svg') },
    },
    datePublished: iso(input.datePublished),
    dateModified: iso(input.dateModified) ?? iso(input.datePublished),
  };
}

export function faqSchema(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

export function productSchema(plans: { name: string; priceMinor: number; currency: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${publicEnv.siteName} Premium`,
    description:
      'Premium membership with unlimited prompt copies, premium-only prompts and the advanced AI prompt generator.',
    brand: { '@type': 'Brand', name: publicEnv.siteName },
    offers: plans.map((plan) => ({
      '@type': 'Offer',
      name: plan.name,
      price: (plan.priceMinor / 100).toFixed(2),
      priceCurrency: plan.currency,
      availability: 'https://schema.org/InStock',
      url: absoluteUrl('/premium'),
    })),
  };
}

/** Serialises a JSON-LD payload, escaping `<` so it cannot break out of the tag. */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
