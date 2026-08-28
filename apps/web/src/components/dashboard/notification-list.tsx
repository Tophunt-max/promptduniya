'use client';

import Link from 'next/link';
import { useState } from 'react';

import { api } from '@/lib/client-api';
import { relativeTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { Switch } from '../ui/field';
import { BellIcon, CheckIcon, CreditCardIcon, CrownIcon, ShieldIcon, SparkleIcon } from '../ui/icon';
import { useToast } from '../ui/toast';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: number | null;
  createdAt: number;
}

interface Preferences {
  newPremiumPrompts: boolean;
  newTrendingPrompts: boolean;
  subscriptionUpdates: boolean;
  paymentUpdates: boolean;
  productUpdates: boolean;
  emailEnabled: boolean;
}

const ICONS: Record<string, React.ReactNode> = {
  welcome: <SparkleIcon size={16} />,
  security: <ShieldIcon size={16} />,
  new_premium_prompt: <CrownIcon size={16} />,
  new_trending_prompt: <SparkleIcon size={16} />,
  subscription_activated: <CrownIcon size={16} />,
  subscription_expiring: <CrownIcon size={16} />,
  subscription_expired: <CrownIcon size={16} />,
  payment_success: <CreditCardIcon size={16} />,
  payment_failed: <CreditCardIcon size={16} />,
};

export function NotificationList({
  items,
  preferences,
}: {
  items: NotificationRow[];
  preferences: Preferences;
}) {
  const toast = useToast();
  const [rows, setRows] = useState(items);
  const [prefs, setPrefs] = useState(preferences);
  const [marking, setMarking] = useState(false);

  const unread = rows.filter((row) => row.readAt === null).length;

  async function markAllRead() {
    setMarking(true);
    try {
      await api.patch('/api/notifications', { all: true });
      setRows((current) => current.map((row) => ({ ...row, readAt: row.readAt ?? Date.now() / 1000 })));
      toast.success('All caught up');
    } catch {
      toast.error('Could not update notifications');
    } finally {
      setMarking(false);
    }
  }

  async function updatePreference(key: keyof Preferences, value: boolean) {
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    try {
      await api.put('/api/notifications', { [key]: value });
    } catch {
      setPrefs(previous);
      toast.error('Could not save that preference');
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
      <section aria-labelledby="inbox">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="inbox" className="text-base font-bold">
            Inbox {unread > 0 && <span className="text-faint">({unread} unread)</span>}
          </h2>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllRead}
              loading={marking}
              leadingIcon={<CheckIcon size={15} />}
            >
              Mark all read
            </Button>
          )}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<BellIcon size={24} />}
            title="No notifications yet"
            description="We'll let you know about membership changes, payments and new premium prompts."
            action={{ label: 'Explore prompts', href: '/explore' }}
          />
        ) : (
          <ul className="card divide-y divide-[var(--border-subtle)]">
            {rows.map((row) => {
              const inner = (
                <div className="flex gap-3 p-4">
                  <span
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-xl',
                      row.readAt === null
                        ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300'
                        : 'bg-[var(--surface-sunken)] text-[var(--text-muted)]',
                    )}
                  >
                    {ICONS[row.type] ?? <BellIcon size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <p
                        className={cn(
                          'text-sm',
                          row.readAt === null ? 'font-bold' : 'font-semibold text-body',
                        )}
                      >
                        {row.title}
                      </p>
                      {row.readAt === null && (
                        <span
                          aria-label="Unread"
                          className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600"
                        />
                      )}
                    </div>
                    {row.body && <p className="mt-1 text-sm leading-relaxed text-body">{row.body}</p>}
                    <p className="mt-1.5 text-xs text-faint">{relativeTime(row.createdAt)}</p>
                  </div>
                </div>
              );

              return (
                <li key={row.id}>
                  {row.href ? (
                    <Link href={row.href} className="block transition-colors hover:bg-[var(--surface-sunken)]">
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="prefs">
        <h2 id="prefs" className="mb-4 text-base font-bold">
          What to notify me about
        </h2>
        <div className="grid gap-2.5">
          <Switch
            label="New premium prompts"
            description="When a prompt is added to the premium collection."
            checked={prefs.newPremiumPrompts}
            onChange={(value) => void updatePreference('newPremiumPrompts', value)}
          />
          <Switch
            label="New trending prompts"
            description="When a prompt starts trending across the community."
            checked={prefs.newTrendingPrompts}
            onChange={(value) => void updatePreference('newTrendingPrompts', value)}
          />
          <Switch
            label="Membership updates"
            description="Activation, renewal reminders and expiry."
            checked={prefs.subscriptionUpdates}
            onChange={(value) => void updatePreference('subscriptionUpdates', value)}
          />
          <Switch
            label="Payment updates"
            description="Receipts, failures and refunds."
            checked={prefs.paymentUpdates}
            onChange={(value) => void updatePreference('paymentUpdates', value)}
          />
          <Switch
            label="Product updates"
            description="Occasional notes about new features. Off by default."
            checked={prefs.productUpdates}
            onChange={(value) => void updatePreference('productUpdates', value)}
          />
          <Switch
            label="Send these by email too"
            description="Security and billing notices are always emailed."
            checked={prefs.emailEnabled}
            onChange={(value) => void updatePreference('emailEnabled', value)}
          />
        </div>
      </section>
    </div>
  );
}
