import type { Metadata } from 'next';
import Link from 'next/link';

import { DashboardShell, StatCard, UsageMeter } from '@/components/dashboard/dashboard-shell';
import { PromptRail } from '@/components/prompt/prompt-grid';
import { Badge, PremiumBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  BookmarkIcon,
  CopyIcon,
  CrownIcon,
  HeartIcon,
  SparkleIcon,
} from '@/components/ui/icon';
import { requireUserPage } from '@/lib/auth/guards';
import { formatDate, relativeTime } from '@/lib/dates';
import { buildMetadata } from '@/lib/seo';
import { formatCompact } from '@/lib/utils';
import { getAccess } from '@/lib/viewer';
import { copyUsage, favoriteUsage, generatorUsage } from '@/services/entitlements';
import { listFavorites, recentCopyActivity, userEngagementStats } from '@/services/engagement';
import { generatorStats } from '@/services/generator';
import { currentSubscription } from '@/services/subscriptions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Dashboard',
  path: '/dashboard',
  noIndex: true,
});

export default async function DashboardPage() {
  const user = await requireUserPage();
  const access = await getAccess();

  const [stats, genStats, subscription, copies, favorites, generators, recentSaves, activity] =
    await Promise.all([
      userEngagementStats(user.id),
      generatorStats(user.id),
      currentSubscription(user.id),
      copyUsage(access, null),
      favoriteUsage(access),
      generatorUsage(access, null),
      listFavorites(user.id, { limit: 4 }),
      recentCopyActivity(user.id, 6),
    ]);

  return (
    <DashboardShell
      title={`Hello, ${user.name.split(' ')[0]}`}
      description="Your activity, limits and saved work in one place."
      actions={
        access.isPremium ? (
          <PremiumBadge />
        ) : (
          <ButtonLink href="/premium" variant="premium" size="sm" leadingIcon={<CrownIcon size={15} />}>
            Go premium
          </ButtonLink>
        )
      }
    >
      <section aria-label="Your stats" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Prompts copied"
          value={formatCompact(stats.copies)}
          hint={`${stats.copiesToday} today`}
          icon={<CopyIcon size={16} />}
        />
        <StatCard
          label="Saved prompts"
          value={formatCompact(stats.saves)}
          href="/favorites"
          icon={<BookmarkIcon size={16} />}
        />
        <StatCard
          label="Liked prompts"
          value={formatCompact(stats.likes)}
          href="/dashboard/liked"
          icon={<HeartIcon size={16} />}
        />
        <StatCard
          label="Generated"
          value={formatCompact(genStats.total)}
          hint={`${genStats.saved} saved`}
          href="/dashboard/generated"
          icon={<SparkleIcon size={16} />}
        />
      </section>

      <section className="mt-8" aria-labelledby="plan-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="plan-heading" className="text-base font-bold">
            Your plan and daily limits
          </h2>
          <div className="flex items-center gap-2">
            <Badge tone={access.isPremium ? 'marigold' : 'neutral'}>
              {subscription?.planName ?? 'Free'} plan
            </Badge>
            {subscription?.endDate && (
              <span className="text-xs text-faint">
                {subscription.autoRenew ? 'Renews' : 'Until'} {formatDate(subscription.endDate)}
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <UsageMeter
            label="Copies today"
            used={copies.used}
            limit={copies.limit}
            hint={copies.unlimited ? 'No daily cap on your plan' : 'Resets at midnight IST'}
          />
          <UsageMeter
            label="Saved favourites"
            used={favorites.used}
            limit={favorites.limit}
            hint={favorites.unlimited ? 'Save as many as you like' : 'Total across your account'}
          />
          <UsageMeter
            label="Generator runs today"
            used={generators.used}
            limit={generators.limit}
            hint={generators.unlimited ? 'No daily cap on your plan' : 'Resets at midnight IST'}
          />
        </div>

        {!access.isPremium && (
          <div className="card mt-3 flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-body">
              Premium removes every limit above and unlocks the premium prompt collection.
            </p>
            <ButtonLink href="/premium" size="sm">
              See plans
            </ButtonLink>
          </div>
        )}
      </section>

      <section className="mt-9" aria-labelledby="saved-heading">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="saved-heading" className="text-base font-bold">
            Recently saved
          </h2>
          <Link
            href="/favorites"
            className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300"
          >
            View all
          </Link>
        </div>

        {recentSaves.length === 0 ? (
          <EmptyState
            icon={<BookmarkIcon size={24} />}
            title="No saved prompts yet"
            description="Tap the bookmark on any prompt to keep it here."
            action={{ label: 'Explore prompts', href: '/explore' }}
          />
        ) : (
          <PromptRail
            prompts={recentSaves.map((row) => ({ ...row, likedByMe: false, savedByMe: true }))}
            canSeePremium={access.isPremium}
          />
        )}
      </section>

      <section className="mt-9" aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="mb-4 text-base font-bold">
          Recent activity
        </h2>
        {activity.length === 0 ? (
          <p className="card p-5 text-sm text-body">
            Nothing yet. Copy a prompt and it will show up here.
          </p>
        ) : (
          <ul className="card divide-y divide-[var(--border-subtle)]">
            {activity.map((item) => (
              <li key={`${item.promptId}-${item.createdAt}`} className="flex items-center gap-3 p-3.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-muted)]">
                  <CopyIcon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/prompt/${item.slug}`}
                    className="block truncate text-sm font-semibold hover:text-brand-600"
                  >
                    {item.title}
                  </Link>
                  <p className="text-xs text-faint">
                    Copied
                    {item.variant !== 'plain' ? ` (${item.variant})` : ''} ·{' '}
                    {relativeTime(item.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}
