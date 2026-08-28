import type { Metadata } from 'next';

import { AdminShell } from '@/components/admin/admin-shell';
import { EMPTY_PROMPT_FORM, PromptEditor } from '@/components/admin/prompt-editor';
import { requireAdminPage } from '@/lib/auth/guards';
import { listCategories } from '@/services/categories';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'New prompt' };

export default async function NewPromptPage() {
  await requireAdminPage();
  const categories = await listCategories({ activeOnly: false });

  return (
    <AdminShell
      title="New prompt"
      description="Write the prompt, set its attributes, preview it, then publish."
    >
      <PromptEditor initial={EMPTY_PROMPT_FORM} categories={categories} />
    </AdminShell>
  );
}
