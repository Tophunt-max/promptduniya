import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/seo';

/**
 * robots.txt
 *
 * Private surfaces (account, admin, API) and thin query-string permutations are
 * disallowed so crawl budget goes to the prompt pages that actually rank.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = [
    '/api/',
    '/admin',
    '/admin/',
    '/dashboard',
    '/dashboard/',
    '/favorites',
    '/profile',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/search',
    '/403',
    // Filtered listing permutations duplicate the canonical listing pages.
    '/explore?',
    '/*?page=',
    '/*?sort=',
    '/*?access=',
    '/*?model=',
    '/*?style=',
    '/*?gender=',
    '/*?aspect=',
    '/*?tag=',
  ];

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      // Ad-network crawlers have no reason to index this site.
      { userAgent: 'AdsBot-Google', disallow: ['/'] },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  };
}
