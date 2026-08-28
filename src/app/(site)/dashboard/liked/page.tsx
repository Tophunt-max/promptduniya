import type { Metadata } from 'next';

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { PromptGrid } from '@/components/prompt/prompt-grid';
import { NoLikesState } from '@/components/ui/empty-state';
import { requireUserPage } from '@/lib/auth/guards';
import { buildMetadata } from '@/lib/seo';
import { getAccess } from '@/lib/viewer';
import { listLikedPrompts } from '@/services/engagement';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Liked prompts',
  path: '/dashboard/liked',
  noIndex: true,
});

export default async function LikedPromptsPage() {
  const user = await requireUserPage('/dashboard/liked');
  const access = await getAccess();
  const liked = await listLikedPrompts(user.id);

  return (
    <DashboardShell
      title="Liked prompts"
      description={`${liked.length} prompt${liked.length === 1 ? '' : 's'} you've liked.`}
    >
      <PromptGrid
        prompts={liked.map((row) => ({
          ...row,
          style: null,
          aspectRatio: null,
          gender: null,
          difficulty: 'beginner',
          isTrending: false,
          isFeatured: false,
          isEditorsPick: false,
          favoriteCount: 0,
          publishedAt: null,
          createdAt: row.likedAt,
          likedByMe: true,
          savedByMe: false,
        }))}
        canSeePremium={access.isPremium}
        columns={3}
        emptyState={<NoLikesState />}
      />
    </DashboardShell>
  );
}
