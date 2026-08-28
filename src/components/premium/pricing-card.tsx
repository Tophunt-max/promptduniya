'use client';

import { useState } from 'react';

import { cn, formatMoney } from '@/lib/utils';
import type { PlanView } from '@/services/plans';
import { Badge, PremiumBadge } from '../ui/badge';
import { Button, ButtonLink } from '../ui/button';
import { CheckIcon, CrownIcon } from '../ui/icon';
import { useViewer } from '../viewer-provider';
import { CheckoutButton } from './checkout-button';

/**
 * Pricing card.
 *
 * The price rendered here comes from the database via the server — it is
 * display-only. When checkout runs, the server re-reads the plan price and
 * ignores anything the browser sends.
 */

export interface PricingCardProps {
  plan: PlanView;
  currentPlanCode: string | null;
  billingLabel: string;
  savingsNote?: string | null;
}

export function PricingCard({ plan, currentPlanCode, billingLabel, savingsNote }: PricingCardProps) {
  const viewer = useViewer();
  const isCurrent = currentPlanCode === plan.code;
  const isFree = plan.priceMinor === 0;

  return (
    <div
      className={cn(
        'card relative flex flex-col p-6',
        plan.isPopular && 'border-brand-400 shadow-[var(--shadow-glow)] lg:-mt-3 lg:mb-3',
      )}
    >
      {plan.isPopular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full gradient-brand px-3 py-1 text-[0.6875rem] font-bold text-white">
          Most popular
        </span>
      )}

      <div className="mb-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-extrabold">{plan.name}</h3>
          {isCurrent && <Badge tone="success">Current plan</Badge>}
        </div>
        {plan.description && <p className="mt-1.5 text-sm text-body">{plan.description}</p>}
      </div>

      <div className="mb-1 flex items-end gap-1.5">
        <span className="text-3xl font-extrabold tracking-tight tabular-nums">
          {isFree ? '₹0' : formatMoney(plan.priceMinor, plan.currency)}
        </span>
        <span className="pb-1 text-sm font-medium text-faint">{billingLabel}</span>
      </div>

      {savingsNote ? (
        <p className="mb-5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          {savingsNote}
        </p>
      ) : (
        <p className="mb-5 text-xs text-faint">
          {plan.billingPeriod === 'lifetime' ? 'No renewals, ever' : 'Cancel any time'}
        </p>
      )}

      <ul className="mb-6 grid flex-1 gap-2.5">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm">
            <span
              className={cn(
                'mt-0.5 grid size-[1.15rem] shrink-0 place-items-center rounded-full',
                isFree
                  ? 'bg-[var(--surface-sunken)] text-[var(--text-muted)]'
                  : 'bg-brand-600 text-white',
              )}
            >
              <CheckIcon size={11} />
            </span>
            <span className="leading-snug text-body">{feature}</span>
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <Button variant="subtle" fullWidth disabled>
          Your current plan
        </Button>
      ) : isFree ? (
        viewer.isAuthenticated ? (
          <Button variant="outline" fullWidth disabled>
            Included with every account
          </Button>
        ) : (
          <ButtonLink href="/register" variant="outline" fullWidth>
            Create a free account
          </ButtonLink>
        )
      ) : viewer.isAuthenticated ? (
        <CheckoutButton
          planCode={plan.code}
          planName={plan.name}
          variant={plan.isPopular ? 'primary' : 'outline'}
        />
      ) : (
        <ButtonLink
          href={`/login?next=${encodeURIComponent('/premium')}`}
          variant={plan.isPopular ? 'primary' : 'outline'}
          fullWidth
          leadingIcon={<CrownIcon size={16} />}
        >
          Sign in to upgrade
        </ButtonLink>
      )}
    </div>
  );
}

/** Banner shown to members who already hold an active subscription. */
export function CurrentMembershipBanner({
  planName,
  endsAt,
  autoRenew,
}: {
  planName: string;
  endsAt: string | null;
  autoRenew: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="card mb-8 flex flex-wrap items-center justify-between gap-4 border-marigold-300 bg-marigold-50/60 p-5 dark:border-marigold-800 dark:bg-marigold-950/25">
      <div className="flex items-start gap-3">
        <PremiumBadge />
        <div>
          <p className="text-sm font-bold">
            You&rsquo;re on the {planName} plan
          </p>
          <p className="mt-0.5 text-xs text-body">
            {endsAt
              ? `${autoRenew ? 'Renews' : 'Access until'} ${endsAt}`
              : 'Lifetime access — nothing to renew'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ButtonLink href="/dashboard/billing" variant="outline" size="sm">
          Manage billing
        </ButtonLink>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs font-semibold text-faint hover:text-[var(--text-primary)]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
