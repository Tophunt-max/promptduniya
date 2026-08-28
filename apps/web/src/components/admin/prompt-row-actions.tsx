'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiClientError, api } from '@/lib/client-api';
import { EditIcon, EyeIcon, TrashIcon } from '../ui/icon';
import { ConfirmDialog } from '../ui/modal';
import { useToast } from '../ui/toast';

/** Inline publish / preview / edit / delete controls for a prompt row. */
export function PromptRowActions({
  promptId,
  slug,
  title,
  isPublished,
}: {
  promptId: string;
  slug: string;
  title: string;
  isPublished: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [published, setPublished] = useState(isPublished);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function togglePublish() {
    setBusy(true);
    try {
      await api.patch(`/api/admin/prompts/${promptId}`, { isPublished: !published });
      setPublished(!published);
      toast.success(published ? 'Moved to drafts' : 'Published');
      router.refresh();
    } catch (error) {
      toast.error(
        'Could not update',
        error instanceof ApiClientError ? error.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.delete(`/api/admin/prompts/${promptId}`);
      toast.success('Prompt deleted');
      setConfirming(false);
      router.refresh();
    } catch (error) {
      toast.error(
        'Could not delete',
        error instanceof ApiClientError ? error.message : 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-0.5">
        <button
          type="button"
          onClick={togglePublish}
          disabled={busy}
          className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-50 dark:text-brand-300 dark:hover:bg-brand-950/50"
        >
          {published ? 'Unpublish' : 'Publish'}
        </button>

        <Link
          href={`/prompt/${slug}`}
          target="_blank"
          aria-label={`Preview ${title}`}
          title="Preview"
          className="grid size-8 place-items-center rounded-lg text-body transition-colors hover:bg-[var(--surface-sunken)]"
        >
          <EyeIcon size={15} />
        </Link>

        <Link
          href={`/admin/prompts/${promptId}`}
          aria-label={`Edit ${title}`}
          title="Edit"
          className="grid size-8 place-items-center rounded-lg text-body transition-colors hover:bg-[var(--surface-sunken)]"
        >
          <EditIcon size={15} />
        </Link>

        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${title}`}
          title="Delete"
          className="grid size-8 place-items-center rounded-lg text-body transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
        >
          <TrashIcon size={15} />
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={remove}
        loading={busy}
        title="Delete this prompt?"
        message={`“${title}” will be removed permanently, along with its likes, saves and view history. This cannot be undone.`}
        confirmLabel="Delete prompt"
      />
    </>
  );
}
