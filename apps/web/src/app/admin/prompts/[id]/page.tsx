import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin/admin-shell';
import { PromptEditor } from '@/components/admin/prompt-editor';
import { ButtonLink } from '@/components/ui/button';
import { EyeIcon } from '@/components/ui/icon';
import { requireAdminPage } from '@/lib/auth/guards';
import { formatDateTime } from '@/lib/dates';
import { formatCompact } from '@/lib/utils';
import { listCategories } from '@/services/categories';
import { getPromptById } from '@/services/prompts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Edit prompt' };

export default async function EditPromptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;

  const [prompt, categories] = await Promise.all([
    getPromptById(id),
    listCategories({ activeOnly: false }),
  ]);

  if (!prompt) notFound();

  return (
    <AdminShell
      title="Edit prompt"
      description={`Last updated ${formatDateTime(prompt.updatedAt)} · ${formatCompact(prompt.viewCount)} views · ${formatCompact(prompt.copyCount)} copies`}
      actions={
        <div className="flex items-center gap-2">
          <ButtonLink
            href={`/prompt/${prompt.slug}`}
            variant="outline"
            size="sm"
            target="_blank"
            leadingIcon={<EyeIcon size={15} />}
          >
            View live
          </ButtonLink>
          <Link
            href="/admin/prompts"
            className="text-sm font-semibold text-body hover:text-brand-600"
          >
            Back to list
          </Link>
        </div>
      }
    >
      <PromptEditor
        categories={categories}
        initial={{
          id: prompt.id,
          title: prompt.title,
          slug: prompt.slug,
          shortDescription: prompt.shortDescription,
          promptText: prompt.promptText ?? '',
          negativePrompt: prompt.negativePrompt ?? '',
          usageInstructions: prompt.usageInstructions ?? '',
          aiModel: prompt.aiModel,
          categoryId: prompt.categoryId,
          style: prompt.style ?? '',
          gender: prompt.gender ?? 'any',
          ageGroup: prompt.ageGroup ?? '',
          location: prompt.location ?? '',
          aspectRatio: prompt.aspectRatio ?? '4:5',
          cameraStyle: prompt.cameraStyle ?? '',
          lighting: prompt.lighting ?? '',
          mood: prompt.mood ?? '',
          difficulty: prompt.difficulty,
          tags: prompt.tags.map((tag) => tag.name).join(', '),
          coverImageUrl: prompt.coverImageUrl ?? '',
          coverImageAlt: prompt.coverImageAlt ?? '',
          seoTitle: prompt.seoTitle ?? '',
          seoDescription: prompt.seoDescription ?? '',
          isPremium: prompt.isPremium,
          isFeatured: prompt.isFeatured,
          isTrending: prompt.isTrending,
          isEditorsPick: prompt.isEditorsPick,
          isPublished: prompt.isPublished,
        }}
      />
    </AdminShell>
  );
}
