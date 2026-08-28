import type { Metadata } from 'next';

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { FavoritesBrowser } from '@/components/dashboard/favorites-browser';
import { requireUserPage } from '@/lib/auth/guards';
import { buildMetadata } from '@/lib/seo';
import { getAccess } from '@/lib/viewer';
import { favoriteUsage } from '@/services/entitlements';
import { listFavorites } from '@/services/engagement';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Your saved prompts',
  path: '/favorites',
  noIndex: true,
});

export default async function FavoritesPage() {
  const user = await requireUserPage('/favorites');
  const access = await getAccess();

  const [favorites, usage] = await Promise.all([
    listFavorites(user.id, { sort: 'recent' }),
    favoriteUsage(access),
  ]);

  return (
    <DashboardShell
      title="Saved prompts"
      description={
        usage.unlimited
          ? `${favorites.length} saved — no limit on your plan.`
          : `${usage.used} of ${usage.limit} saves used on your plan.`
      }
    >
      <FavoritesBrowser
        favorites={favorites.map((row) => ({ ...row, savedByMe: true, likedByMe: false }))}
        canSeePremium={access.isPremium}
      />
    </DashboardShell>
  );
}
