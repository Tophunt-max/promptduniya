'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiClientError, api } from '@/lib/client-api';
import { useToast } from '../ui/toast';

/** Shared handler for the moderation PATCH endpoint. */
function useModerationAction() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run(payload: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    try {
      await api.patch('/api/admin/moderation', payload);
      toast.success(successMessage);
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

  return { run, busy };
}

const BUTTON =
  'rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-50';

export function ReportStatusControl({ reportId, status }: { reportId: string; status: string }) {
  const { run, busy } = useModerationAction();

  return (
    <div className="flex items-center justify-end gap-1">
      {status === 'open' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run({ kind: 'report', id: reportId, status: 'reviewing' }, 'Marked as reviewing')}
          className={`${BUTTON} text-brand-600 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/50`}
        >
          Review
        </button>
      )}
      <button
        type="button"
        disabled={busy || status === 'resolved'}
        onClick={() => void run({ kind: 'report', id: reportId, status: 'resolved' }, 'Report resolved')}
        className={`${BUTTON} text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40`}
      >
        Resolve
      </button>
      <button
        type="button"
        disabled={busy || status === 'dismissed'}
        onClick={() => void run({ kind: 'report', id: reportId, status: 'dismissed' }, 'Report dismissed')}
        className={`${BUTTON} text-body hover:bg-[var(--surface-sunken)]`}
      >
        Dismiss
      </button>
    </div>
  );
}

export function CommentStatusControl({ commentId, status }: { commentId: string; status: string }) {
  const { run, busy } = useModerationAction();

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        disabled={busy || status === 'approved'}
        onClick={() => void run({ kind: 'comment', id: commentId, status: 'approved' }, 'Comment approved')}
        className={`${BUTTON} text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40`}
      >
        Approve
      </button>
      <button
        type="button"
        disabled={busy || status === 'rejected'}
        onClick={() => void run({ kind: 'comment', id: commentId, status: 'rejected' }, 'Comment rejected')}
        className={`${BUTTON} text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40`}
      >
        Reject
      </button>
    </div>
  );
}

export function MessageStatusControl({
  messageId,
  status,
}: {
  messageId: string;
  status: string;
}) {
  const { run, busy } = useModerationAction();

  return (
    <div className="flex items-center justify-end gap-1">
      {status !== 'read' && status !== 'replied' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run({ kind: 'message', id: messageId, status: 'read' }, 'Marked as read')}
          className={`${BUTTON} text-body hover:bg-[var(--surface-sunken)]`}
        >
          Mark read
        </button>
      )}
      <button
        type="button"
        disabled={busy || status === 'replied'}
        onClick={() => void run({ kind: 'message', id: messageId, status: 'replied' }, 'Marked as replied')}
        className={`${BUTTON} text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40`}
      >
        Replied
      </button>
      <button
        type="button"
        disabled={busy || status === 'spam'}
        onClick={() => void run({ kind: 'message', id: messageId, status: 'spam' }, 'Marked as spam')}
        className={`${BUTTON} text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40`}
      >
        Spam
      </button>
    </div>
  );
}
