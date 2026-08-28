import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage } from '@/components/legal/legal-page';
import { buildMetadata } from '@/lib/seo';
import { getBrand } from '@/services/settings';

export const revalidate = 86400;

export const metadata: Metadata = buildMetadata({
  title: 'Refund and cancellation policy',
  description:
    'How cancellations, refunds and failed payments are handled for promptduniya premium memberships.',
  path: '/refund-policy',
});

const UPDATED = Math.floor(Date.parse('2026-08-01T00:00:00Z') / 1000);

export default async function RefundPolicyPage() {
  const brand = await getBrand();

  return (
    <LegalPage
      title="Refund and cancellation policy"
      intro="Digital memberships give immediate access, which limits when a refund is possible. Here is exactly where we stand."
      updatedAt={UPDATED}
      contactEmail={brand.contactEmail}
      sections={[
        {
          heading: 'Cancelling your membership',
          body: (
            <>
              <p>
                You can turn off auto-renewal at any time from{' '}
                <Link href="/dashboard/billing">Premium and billing</Link>. Two things follow:
              </p>
              <ul>
                <li>You keep full premium access until the end of the period you have paid for</li>
                <li>Nothing further is charged after that; the account returns to the free plan</li>
              </ul>
              <p>
                Cancelling is not the same as requesting a refund. It stops future charges; it does
                not reverse a completed one.
              </p>
            </>
          ),
        },
        {
          heading: 'When we will refund',
          body: (
            <>
              <p>We refund in full in these situations:</p>
              <ul>
                <li>
                  <strong>Duplicate charge.</strong> You were charged twice for the same period.
                </li>
                <li>
                  <strong>Charged but not activated.</strong> Payment succeeded but premium access was
                  not granted and we cannot fix it promptly.
                </li>
                <li>
                  <strong>Unauthorised charge.</strong> A payment was made from your account without
                  your permission, confirmed with your bank or Razorpay.
                </li>
                <li>
                  <strong>Discontinued feature.</strong> We withdraw a paid feature you bought,
                  refunded pro-rata for the unused period.
                </li>
              </ul>
              <p>
                We also consider a full refund within <strong>7 days</strong> of a first-time
                purchase if you have used very little of the service — as a guide, fewer than 10
                prompt copies and 5 generator runs. Email us and we will look at your account.
              </p>
            </>
          ),
        },
        {
          heading: 'When we will not refund',
          body: (
            <>
              <ul>
                <li>
                  You have made substantial use of premium features during the billing period
                </li>
                <li>
                  You are unhappy with images produced by a third-party AI tool. Image models are
                  non-deterministic and results vary; we supply prompt text, not images
                </li>
                <li>You forgot to cancel before a renewal that has already been used</li>
                <li>Your account was suspended for a deliberate breach of the terms</li>
                <li>
                  The lifetime plan, more than 7 days after purchase — it is priced as a one-time,
                  non-recurring commitment
                </li>
              </ul>
              <p>
                None of this limits rights you have under Indian consumer law that cannot be waived.
              </p>
            </>
          ),
        },
        {
          heading: 'Failed and pending payments',
          body: (
            <>
              <p>
                If a payment fails, nothing is captured and there is nothing to refund. Occasionally a
                bank shows a temporary hold that clears on its own, usually within 5 to 7 working
                days.
              </p>
              <p>
                If a payment shows as pending, our server waits for the provider webhook to confirm
                it and then activates access automatically — you do not need to pay again. If a
                pending payment has not resolved after 24 hours, contact us with the receipt number.
              </p>
            </>
          ),
        },
        {
          heading: 'How to request a refund',
          body: (
            <>
              <p>
                Use the <Link href="/contact">contact form</Link> or email us from your registered
                address, and include:
              </p>
              <ul>
                <li>The receipt number from Premium and billing</li>
                <li>The payment date and amount</li>
                <li>A short note on what went wrong</li>
              </ul>
              <p>
                We reply within <strong>2 working days</strong>. Approved refunds are issued to the
                original payment method through Razorpay and typically land within{' '}
                <strong>5 to 10 working days</strong>, depending on your bank.
              </p>
            </>
          ),
        },
        {
          heading: 'Chargebacks',
          body: (
            <p>
              Please contact us before raising a chargeback with your bank — it is almost always
              faster to resolve directly. Accounts with an unresolved chargeback are suspended until
              the dispute is settled.
            </p>
          ),
        },
      ]}
    />
  );
}
