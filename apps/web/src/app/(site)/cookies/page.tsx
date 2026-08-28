import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage } from '@/components/legal/legal-page';
import { buildMetadata } from '@/lib/seo';
import { getBrand } from '@/services/settings';

export const revalidate = 86400;

export const metadata: Metadata = buildMetadata({
  title: 'Cookie policy',
  description: 'The two cookies promptduniya sets, what they do, and what we deliberately avoid.',
  path: '/cookies',
});

const UPDATED = Math.floor(Date.parse('2026-08-01T00:00:00Z') / 1000);

export default async function CookiePolicyPage() {
  const brand = await getBrand();

  return (
    <LegalPage
      title="Cookie policy"
      intro="We use two cookies, both strictly necessary. There are no advertising or cross-site tracking cookies on this site."
      updatedAt={UPDATED}
      contactEmail={brand.contactEmail}
      sections={[
        {
          heading: 'Cookies we set',
          body: (
            <>
              <h3>pd_session</h3>
              <ul>
                <li>
                  <strong>Purpose:</strong> keeps you signed in
                </li>
                <li>
                  <strong>Contents:</strong> an opaque random token. We store only a SHA-256 hash of
                  it server-side, so the database never holds a usable session cookie
                </li>
                <li>
                  <strong>Lifetime:</strong> 30 days by default, or until you sign out
                </li>
                <li>
                  <strong>Flags:</strong> HttpOnly, SameSite=Lax, Secure in production
                </li>
              </ul>

              <h3>pd_csrf</h3>
              <ul>
                <li>
                  <strong>Purpose:</strong> confirms that requests which change data came from our own
                  pages
                </li>
                <li>
                  <strong>Contents:</strong> a random token, echoed back by our JavaScript in a
                  request header
                </li>
                <li>
                  <strong>Lifetime:</strong> matches the session
                </li>
                <li>
                  <strong>Flags:</strong> readable by JavaScript by design (that is how the
                  double-submit check works), SameSite=Lax, Secure in production
                </li>
              </ul>
            </>
          ),
        },
        {
          heading: 'Local storage',
          body: (
            <>
              <p>
                A few preferences are kept in your browser&rsquo;s local storage rather than in
                cookies, which means they are never sent to our server:
              </p>
              <ul>
                <li>
                  <strong>pd-theme</strong> — your light, dark or system theme choice
                </li>
                <li>
                  <strong>pd-recent-searches</strong> — your recent search terms, for the search
                  suggestions panel
                </li>
                <li>
                  <strong>pd-privacy-choice</strong> — whether you dismissed the privacy banner
                </li>
              </ul>
              <p>Clearing site data in your browser removes all of these.</p>
            </>
          ),
        },
        {
          heading: 'What we do not use',
          body: (
            <ul>
              <li>No advertising cookies or ad-network pixels</li>
              <li>No cross-site tracking or data brokers</li>
              <li>No third-party analytics scripts</li>
              <li>No social media tracking widgets — our share links are plain anchors</li>
            </ul>
          ),
        },
        {
          heading: 'Third parties',
          body: (
            <p>
              Razorpay&rsquo;s checkout script is loaded only when you actually start a payment, and
              only on that page. It may set its own cookies to run the payment session; that is
              covered by Razorpay&rsquo;s policies. It is not loaded anywhere else on the site.
            </p>
          ),
        },
        {
          heading: 'Your choices',
          body: (
            <>
              <p>
                The privacy banner lets you choose essential cookies only, which disables the
                optional first-party analytics. The session and CSRF cookies cannot be disabled while
                you are signed in — without them, sign-in cannot work at all.
              </p>
              <p>
                You can also block or clear cookies in your browser settings. Doing so will sign you
                out. See our <Link href="/privacy">privacy policy</Link> for the wider picture.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
