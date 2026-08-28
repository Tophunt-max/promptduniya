import type { Metadata } from 'next';

import { AdminShell } from '@/components/admin/admin-shell';
import { ArticleManager } from '@/components/admin/article-manager';
import { requireAdminPage } from '@/lib/auth/guards';
import { adminListArticles } from '@/services/articles';
import { listCategories } from '@/services/categories';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Articles' };

export default async function AdminArticlesPage() {
  await requireAdminPage();
  const [articles, categories] = await Promise.all([
    adminListArticles(),
    listCategories({ activeOnly: false }),
  ]);

  return (
    <AdminShell
      title="Articles"
      description="Long-form guides that support the prompt library. Write original content — thin or duplicated pages hurt rankings."
    >
      <ArticleManager
        initial={articles}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </AdminShell>
  );
}
