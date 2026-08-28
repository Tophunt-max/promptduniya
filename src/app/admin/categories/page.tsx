import type { Metadata } from 'next';

import { AdminShell } from '@/components/admin/admin-shell';
import { CategoryManager } from '@/components/admin/category-manager';
import { requireAdminPage } from '@/lib/auth/guards';
import { adminListCategories } from '@/services/categories';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Categories' };

export default async function AdminCategoriesPage() {
  await requireAdminPage();
  const categories = await adminListCategories();

  return (
    <AdminShell
      title="Categories"
      description="Add, edit, reorder and retire categories. A category with prompts cannot be deleted until they are moved."
    >
      <CategoryManager initial={categories} />
    </AdminShell>
  );
}
