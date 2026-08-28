import { CookieConsent } from '@/components/layout/cookie-consent';
import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { MobileNav, MobileNavSpacer } from '@/components/layout/mobile-nav';
import { ServiceWorkerRegistrar } from '@/components/pwa/service-worker';
import { JsonLd } from '@/components/seo/json-ld';
import { organizationSchema, websiteSchema } from '@/lib/seo';
import { popularSearchTerms } from '@/services/analytics';
import { listCategories } from '@/services/categories';
import { getBrand } from '@/services/settings';

/**
 * Public site shell.
 *
 * Data needed by the chrome (brand, categories, popular searches) is fetched
 * once here rather than in every page. Failures degrade to sensible defaults so
 * a cold database never takes the whole layout down.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [brand, categories, popular] = await Promise.all([
    getBrand(),
    listCategories().catch(() => []),
    popularSearchTerms(6).catch(() => []),
  ]);

  return (
    <>
      <JsonLd data={websiteSchema({ name: brand.name, siteUrl: brand.siteUrl })} />
      <JsonLd
        data={organizationSchema({
          name: brand.name,
          siteUrl: brand.siteUrl,
          social: Object.values(brand.social),
        })}
      />

      <div className="flex min-h-dvh flex-col">
        <Header popularSearches={popular} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer brand={brand} categories={categories} />
        <MobileNavSpacer />
      </div>

      <MobileNav />
      <CookieConsent />
      <ServiceWorkerRegistrar />
    </>
  );
}
