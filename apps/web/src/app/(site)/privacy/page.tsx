import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage } from '@/components/legal/legal-page';
import { buildMetadata } from '@/lib/seo';
import { getBrand } from '@/services/settings';

export const revalidate = 86400;

export const metadata: Metadata = buildMetadata({
  title: 'Privacy policy',
  description:
    'What data promptduniya collects, why we collect it, how long we keep it, and the controls you have over it.',
  path: '/privacy',
});

const UPDATED = Math.floor(Date.parse('2026-08-01T00:00:00Z') / 1000);

export default async function PrivacyPage() {
  const brand = await getBrand();

  return (
    <LegalPage
      title="Privacy policy"
      intro="We collect the minimum we need to run your account and keep the service working. This page explains exactly what that means."
      updatedAt={UPDATED}
      contactEmail={brand.contactEmail}
      sections={[
        {
          heading: 'What we collect',
          body: (
            <>
              <p>When you create an account we store:</p>
              <ul>
                <li>Your name, email address and username</li>
                <li>A bcrypt hash of your password — never the password itself</li>
                <li>Optional profile details you choose to add (bio, location, links)</li>
                <li>Your saved prompts, likes and generated prompt history</li>
              </ul>
              <p>
                To enforce daily plan limits we also record a count of prompt copies and generator
                runs per day, associated with your account.
              </p>
              <p>
                For visitors who are not signed in, we store a keyed hash derived from IP address
                and browser user-agent. This lets us apply guest limits and de-duplicate view counts
                without retaining the IP address itself.
              </p>
            </>
          ),
        },
        {
          heading: 'What we deliberately do not collect',
          body: (
            <ul>
              <li>Raw IP addresses are not stored — only a salted, keyed hash</li>
              <li>No third-party advertising or cross-site tracking scripts</li>
              <li>No card details: payments are handled entirely by Razorpay</li>
              <li>No precise location, contacts, or device fingerprinting</li>
            </ul>
          ),
        },
        {
          heading: 'Cookies',
          body: (
            <>
              <p>We set two cookies, both strictly necessary:</p>
              <ul>
                <li>
                  <strong>pd_session</strong> — an opaque session token so you stay signed in.
                  HttpOnly, SameSite=Lax, and Secure in production.
                </li>
                <li>
                  <strong>pd_csrf</strong> — a token used to verify that state-changing requests came
                  from our own pages.
                </li>
              </ul>
              <p>
                We do not set advertising or analytics cookies. See the{' '}
                <Link href="/cookies">cookie policy</Link> for detail.
              </p>
            </>
          ),
        },
        {
          heading: 'Analytics',
          body: (
            <>
              <p>
                We record aggregated, pseudonymous counts — page paths, prompt views, copies and
                search terms — bucketed by day. This tells us which prompts are useful and where the
                site is confusing. It is first-party only and never shared or sold.
              </p>
              <p>
                An administrator can switch this off entirely from the settings panel, and the
                privacy banner lets you choose essential cookies only.
              </p>
            </>
          ),
        },
        {
          heading: 'Payments',
          body: (
            <>
              <p>
                Payments are processed by Razorpay. We send them the amount, currency and your name
                and email so they can raise the payment and issue a receipt. We store the resulting
                payment and order identifiers, the amount, the method used (for example UPI or card)
                and the status.
              </p>
              <p>
                Card numbers, UPI PINs and bank credentials never reach our servers. Razorpay&rsquo;s
                own privacy policy governs their handling of that data.
              </p>
            </>
          ),
        },
        {
          heading: 'Email',
          body: (
            <p>
              We send transactional email only: address verification, password resets, payment
              receipts and membership notices. You can turn off optional product updates in your
              notification preferences. Security and billing notices are always sent, because you
              need them.
            </p>
          ),
        },
        {
          heading: 'How long we keep things',
          body: (
            <ul>
              <li>Account data — until you ask us to delete your account</li>
              <li>Session records — until expiry, then removed</li>
              <li>Analytics day-buckets — retained in aggregate; no per-person profile is built</li>
              <li>
                Payment records — retained as long as required for tax and accounting obligations,
                even after account deletion
              </li>
            </ul>
          ),
        },
        {
          heading: 'Your controls',
          body: (
            <>
              <p>You can, at any time:</p>
              <ul>
                <li>Edit or remove your profile information</li>
                <li>Delete saved prompts and generated prompt history</li>
                <li>Change notification preferences</li>
                <li>Request an export of your data, or deletion of your account</li>
              </ul>
              <p>
                Email us from your registered address, or use the{' '}
                <Link href="/contact">contact form</Link>, and we will action it.
              </p>
            </>
          ),
        },
        {
          heading: 'Security',
          body: (
            <p>
              Passwords are hashed with bcrypt. Sessions are opaque tokens stored as hashes, so a
              database leak would not hand over usable session cookies. All traffic is served over
              HTTPS with strict transport security, a content security policy and rate limiting on
              sensitive endpoints. No system is perfectly secure, but we take it seriously and design
              accordingly.
            </p>
          ),
        },
        {
          heading: 'Children',
          body: (
            <p>
              This service is not directed at children under 13, and we do not knowingly collect
              their data. If you believe a child has created an account, contact us and we will
              remove it.
            </p>
          ),
        },
        {
          heading: 'Changes to this policy',
          body: (
            <p>
              If we make a material change we will update the date at the top of this page and, where
              the change is significant, notify account holders by email or an in-app notice.
            </p>
          ),
        },
      ]}
    />
  );
}
