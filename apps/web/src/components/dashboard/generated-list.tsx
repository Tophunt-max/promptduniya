'use client';

import { useState } from 'react';

import { ApiClientError, api, copyToClipboard } from '@/lib/client-api';
import { aiModel } from '@/lib/constants';
import { relativeTime } from '@/lib/dates';
import { Badge } from '../ui/badge';
import { NoGeneratedState } from '../ui/empty-state';
import { CheckIcon, CopyIcon, TrashIcon } from '../ui/icon';
import { ConfirmDialog } from '../ui/modal';
import { useToast } from '../ui/toast';

export interface GeneratedItem {
  id: string;
  title: string | null;
  output: string;
  negativeOutput: string | null;
  aiModel: string;
  mode: string;
  engine: string;
  isSaved: boolean;
  createdAt: number;
}

/** History of prompts this user generated, with copy and delete. */
export function GeneratedList({ items }: { items: GeneratedItem[] }) {
  const toast = useToast();
  const [rows, setRows] = useState(items);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GeneratedItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (rows.length === 0) return <NoGeneratedState />;

  async function onCopy(item: GeneratedItem) {
    const text = item.negativeOutput
      ? `${item.output}\n\nNegative prompt:\n${item.negativeOutput}`
      : item.output;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedId(item.id);
      toast.success('Prompt copied successfully');
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      toast.error('Could not copy', 'Select the text manually instead.');
    }
  }

  async function onDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/api/generator/save?id=${encodeURIComponent(pendingDelete.id)}`);
      setRows((current) => current.filter((row) => row.id !== pendingDelete.id));
      toast.success('Deleted');
    } catch (error) {
      toast.error(
        'Could not delete',
        error instanceof ApiClientError ? error.message : 'Please try again.',
      );
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  return (
    <>
      <ul className="grid gap-3">
        {rows.map((item) => {
          const model = aiModel(item.aiModel);
          return (
            <li key={item.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold">{item.title ?? 'Untitled prompt'}</h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone="neutral">{model.short}</Badge>
                    <Badge tone={item.mode === 'random' ? 'marigold' : 'brand'}>
                      {item.mode === 'random' ? 'Random' : 'Advanced'}
                    </Badge>
                    {item.isSaved && <Badge tone="success">Saved</Badge>}
                    <span className="text-xs text-faint">{relativeTime(item.createdAt)}</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void onCopy(item)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-body transition-colors hover:bg-[var(--surface-sunken)] hover:text-brand-600"
                  >
                    {copiedId === item.id ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
                    {copiedId === item.id ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(item)}
                    aria-label={`Delete ${item.title ?? 'prompt'}`}
                    className="grid size-9 place-items-center rounded-lg text-body transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>
              </div>

              <details className="mt-3 group">
                <summary className="cursor-pointer list-none text-xs font-semibold text-brand-600 marker:hidden dark:text-brand-300">
                  <span className="group-open:hidden">Show prompt</span>
                  <span className="hidden group-open:inline">Hide prompt</span>
                </summary>
                <div className="prompt-box mt-2.5 max-h-64 overflow-y-auto px-3.5 py-3">
                  <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                    {item.output}
                  </p>
                  {item.negativeOutput && (
                    <p className="mt-3 border-t border-white/10 pt-3 whitespace-pre-wrap font-mono text-xs leading-relaxed opacity-70">
                      Negative: {item.negativeOutput}
                    </p>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={onDelete}
        loading={deleting}
        title="Delete this prompt?"
        message="This removes it from your history. It cannot be undone."
        confirmLabel="Delete"
      />
    </>
  );
}
