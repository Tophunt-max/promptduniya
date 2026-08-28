import type { Metadata } from 'next';

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { GeneratedList } from '@/components/dashboard/generated-list';
import { ButtonLink } from '@/components/ui/button';
import { SparkleIcon } from '@/components/ui/icon';
import { requireUserPage } from '@/lib/auth/guards';
import { buildMetadata } from '@/lib/seo';
import { generatorStats, listGenerated } from '@/services/generator';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'My generated prompts',
  path: '/dashboard/generated',
  noIndex: true,
});

export default async function GeneratedPromptsPage() {
  const user = await requireUserPage('/dashboard/generated');
  const [items, stats] = await Promise.all([
    listGenerated(user.id, { limit: 60 }),
    generatorStats(user.id),
  ]);

  return (
    <DashboardShell
      title="My generated prompts"
      description={`${stats.total} generated in total, ${stats.saved} kept.`}
      actions={
        <ButtonLink href="/generator" size="sm" leadingIcon={<SparkleIcon size={15} />}>
          Generate another
        </ButtonLink>
      }
    >
      <GeneratedList items={items} />
    </DashboardShell>
  );
}
