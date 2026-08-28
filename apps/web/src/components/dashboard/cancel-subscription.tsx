'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiClientError, api } from '@/lib/client-api';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import { useToast } from '../ui/toast';

/**
 * Cancels auto-renewal.
 *
 * The copy is explicit that access continues to the end of the paid period —
 * cancelling is not a refund, and the user should not be surprised either way.
 */
export function CancelSubscriptionButton({ endsAt }: { endsAt: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function cancel() {
    setLoading(true);
    try {
      const result = await api.post<{ message: string }>('/api/subscriptions/cancel');
      toast.success('Auto-renewal turned off', result.message);
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(
        'Could not cancel',
        error instanceof ApiClientError ? error.message : 'Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Turn off auto-renew
      </Button>

      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title="Turn off auto-renewal?"
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" fullWidth onClick={() => setOpen(false)}>
              Keep it on
            </Button>
            <Button variant="danger" fullWidth loading={loading} onClick={cancel}>
              Turn off auto-renew
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 text-sm text-body">
          <p>
            You will keep full premium access until <strong>{endsAt}</strong>. Nothing further will
            be charged after that, and your account will move back to the free plan.
          </p>
          <p>Your saved prompts and favourites stay in your account either way.</p>
          <p className="text-xs text-faint">
            This is not a refund request. If you need a refund, see our refund policy or contact us.
          </p>
        </div>
      </Modal>
    </>
  );
}
