import type { Metadata } from 'next';
import Link from 'next/link';

import { CurrentMembershipBanner, PricingCard } from '@/components/premium/pricing-card';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { CheckIcon, CloseIcon, ShieldIcon } from '@/components/ui/icon';
import { formatDate } from '@/lib/dates';
import { razorpayConfigured } from '@/services/settings';
import { breadcrumbSchema, buildMetadata, faqSchema, productSchema } from '@/lib/seo';
import { formatMoney } from '@/lib/utils';
import { getAccess } from '@/lib/viewer';
import { billingLabel, pricingTable } from '@/services/plans';
import { currentSubscription } from '@/services/subscriptions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Premium membership and pricing',
  description:
    'Go premium for unlimited prompt copies, unlimited favourites, every premium-only prompt and the advanced AI prompt generator. Pay by UPI, card, net banking or wallet.',
  path: '/premium',
  keywords: ['ai prompt membership', 'premium ai prompts india', 'prompt library subscription'],
});

const FAQS = [
  {
    question: 'What payment methods can I use?',
    answer:
      'Payments are handled by Razorpay, which supports UPI, credit and debit cards, net banking and popular wallets. We never see or store your card details.',
  },
  {
    question: 'Can I cancel whenever I want?',
    answer:
      'Yes. Cancelling turns off auto-renewal and you keep premium access until the end of the period you have already paid for. Nothing is charged after that.',
  },
  {
    question: 'What happens when my membership expires?',
    answer:
      'Your account reverts to the free plan. Your saved prompts stay in your account — you simply return to the free daily limits, and premium-only prompts lock again.',
  },
  {
    question: 'Is the lifetime plan really one payment?',
    answer:
      'Yes. The lifetime plan is a single payment with no renewals. It covers premium access and all future premium prompt packs for as long as the service operates.',
  },
  {
    question: 'Do you offer refunds?',
    answer:
      'Refund eligibility is set out in our refund policy. If something has gone wrong with a payment, contact us and we will look into it.',
  },
  {
    question: 'Can I use the images commercially?',
    answer:
      'The prompt text is yours to use and adapt. Rights over the images you generate depend on the terms of the AI tool you run the prompt in, so check that provider\u2019s licence.',
  },
];

const COMPARISON = [
  { feature: 'Browse and search every prompt', free: true, premium: true },
  { feature: 'Prompt copies per day', free: '10', premium: 'Unlimited' },
  { feature: 'Saved favourites', free: '25', premium: 'Unlimited' },
  { feature: 'Generator runs per day', free: '10', premium: 'Unlimited' },
  { feature: 'Premium-only prompt collection', free: false, premium: true },
  { feature: 'Negative prompts and setup notes', free: 'On some prompts', premium: 'On every prompt' },
  { feature: 'Advanced AI generator engine', free: false, premium: true },
  { feature: 'Ad-free experience', free: false, premium: true },
  { feature: 'Premium badge on your profile', free: false, premium: true },
  { feature: 'Priority email support', free: false, premium: true },
];

export default async function PremiumPage() {
  const access = await getAccess();
  const [plans, subscription, liveGateway] = await Promise.all([
    pricingTable(),
    access.userId ? currentSubscription(access.userId) : Promise.resolve(null),
    razorpayConfigured(),
  ]);

  const monthly = plans.find((plan) => plan.code === 'monthly');

  function savingsFor(planCode: string, priceMinor: number): string | null {
    if (!monthly || monthly.priceMinor === 0) return null;
    if (planCode === 'yearly') {
      const yearlyEquivalent = monthly.priceMinor * 12;
      const saved = yearlyEquivalent - priceMinor;
      if (saved <= 0) return null;
      return `Save ${formatMoney(saved)} a year versus monthly`;
    }
    return null;
  }

  return (
    <div className="container-page py-8 sm:py-12">
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Premium', path: '/premium' },
        ])}
      />
      <JsonLd data={faqSchema(FAQS)} />
      <JsonLd
        data={productSchema(
          plans
            .filter((plan) => plan.priceMinor > 0)
            .map((plan) => ({
              name: plan.name,
              priceMinor: plan.priceMinor,
              currency: plan.currency,
            })),
        )}
      />

      <header className="mx-auto mb-10 max-w-2xl text-center">
        <Badge tone="marigold" className="mb-3">
          Premium membership
        </Badge>
        <h1 className="text-3xl font-extrabold sm:text-4xl">
          Unlimited prompts. <span className="gradient-text">No limits, no ads.</span>
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-body">
          Free gets you a real taste of the library. Premium removes the daily caps, unlocks the
          premium collection and turns on the advanced generator.
        </p>
      </header>

      {subscription && (
        <CurrentMembershipBanner
          planName={subscription.planName}
          endsAt={subscription.endDate ? formatDate(subscription.endDate) : null}
          autoRenew={subscription.autoRenew}
        />
      )}

      {!liveGateway && (
        <div className="card mb-8 flex items-start gap-3 border-amber-300 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-950/25">
          <ShieldIcon size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm">
            <p className="font-bold">Test mode</p>
            <p className="mt-0.5 leading-relaxed text-body">
              No live payment gateway is configured on this deployment, so checkout runs against a
              local simulator. Signature verification, amount checks and webhook idempotency all
              still run exactly as they would in production — see DEPLOYMENT.md to connect Razorpay.
            </p>
          </div>
        </div>
      )}

      <section aria-label="Plans" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <PricingCard
            key={plan.id}
            plan={plan}
            currentPlanCode={subscription?.planCode ?? (access.isAuthenticated ? 'free' : null)}
            billingLabel={billingLabel(plan)}
            savingsNote={savingsFor(plan.code, plan.priceMinor)}
          />
        ))}
      </section>

      <p className="mt-5 text-center text-xs text-faint">
        Prices are in Indian Rupees and include applicable taxes where required. Plan prices are
        managed by the site administrator and may change — the amount shown on the payment screen is
        always the amount charged.
      </p>

      <section className="mt-16" aria-labelledby="compare">
        <h2 id="compare" className="mb-5 text-xl font-extrabold">
          Free vs Premium
        </h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <caption className="sr-only">Feature comparison between the free and premium plans</caption>
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
                <th scope="col" className="px-4 py-3 text-left font-bold">
                  Feature
                </th>
                <th scope="col" className="px-4 py-3 text-center font-bold">
                  Free
                </th>
                <th scope="col" className="px-4 py-3 text-center font-bold text-brand-600 dark:text-brand-300">
                  Premium
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.feature} className="border-b border-[var(--border-subtle)] last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-medium">
                    {row.feature}
                  </th>
                  <ComparisonCell value={row.free} />
                  <ComparisonCell value={row.premium} highlight />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-faint">
          Daily limits are configurable by the site administrator; the figures above reflect the
          current defaults.
        </p>
      </section>

      <section id="faq" className="mt-16" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="mb-5 text-xl font-extrabold">
          Frequently asked questions
        </h2>
        <div className="grid gap-2.5 lg:grid-cols-2">
          {FAQS.map((faq) => (
            <details key={faq.question} className="card group p-5">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">
                <span className="flex items-start justify-between gap-3 text-sm">
                  {faq.question}
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-faint transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-2.5 text-sm leading-relaxed text-body">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-14 border-t border-[var(--border-subtle)] pt-8">
        <div className="flex flex-wrap items-start gap-3">
          <ShieldIcon size={20} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-300" />
          <div className="max-w-2xl text-sm">
            <p className="font-bold">How we handle your payment</p>
            <p className="mt-1.5 leading-relaxed text-body">
              Orders are created on our server, where the price is read from our own database — the
              amount is never taken from the browser. After payment, we verify Razorpay&rsquo;s
              signature and independently re-check the payment status with them before premium access
              is switched on. Card details never touch our servers.
            </p>
            <p className="mt-2.5 text-xs text-faint">
              See our{' '}
              <Link href="/refund-policy" className="font-semibold underline">
                refund policy
              </Link>
              ,{' '}
              <Link href="/terms" className="font-semibold underline">
                terms
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="font-semibold underline">
                privacy policy
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function ComparisonCell({
  value,
  highlight,
}: {
  value: boolean | string;
  highlight?: boolean;
}) {
  if (typeof value === 'string') {
    return (
      <td className={`px-4 py-3 text-center font-semibold ${highlight ? 'text-brand-600 dark:text-brand-300' : ''}`}>
        {value}
      </td>
    );
  }

  return (
    <td className="px-4 py-3 text-center">
      {value ? (
        <span className="inline-grid size-5 place-items-center rounded-full bg-emerald-500 text-white">
          <CheckIcon size={12} />
          <span className="sr-only">Included</span>
        </span>
      ) : (
        <span className="inline-grid size-5 place-items-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-muted)]">
          <CloseIcon size={12} />
          <span className="sr-only">Not included</span>
        </span>
      )}
    </td>
  );
}
