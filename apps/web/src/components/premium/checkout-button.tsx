'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { ApiClientError, api } from '@/lib/client-api';
import { formatMoney } from '@/lib/utils';
import { Button } from '../ui/button';
import { Input } from '../ui/field';
import { CheckIcon, CrownIcon, TagIcon } from '../ui/icon';
import { Modal } from '../ui/modal';
import { useToast } from '../ui/toast';

/**
 * Razorpay checkout.
 *
 * Flow, and what is trusted where:
 *   1. POST /api/payments/order  → the server creates the order and decides the
 *      amount from the plan row. The browser only sends a plan code.
 *   2. Razorpay Checkout collects the payment (UPI, cards, net banking, wallets).
 *   3. POST /api/payments/verify → the server verifies the HMAC signature and
 *      re-fetches the payment from Razorpay before granting anything.
 *
 * Nothing on this page can activate premium access on its own. If the browser
 * closes mid-flow, the webhook completes the activation instead.
 */

interface OrderResponse {
  orderId: string;
  amountMinor: number;
  currency: string;
  planCode: string;
  planName: string;
  keyId: string;
  isMock: boolean;
  discountMinor: number;
  couponCode: string | null;
  receipt: string;
  prefill: { name: string; email: string };
}

interface CouponResponse {
  code: string;
  discountLabel: string;
  finalAmountMinor: number;
  finalAmountLabel: string;
  originalAmountLabel: string;
}

interface VerifyResponse {
  status: 'activated' | 'pending' | 'failed';
  planName: string;
  message: string;
}

/** Minimal shape of the Razorpay Checkout global. */
interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email: string };
  theme: { color: string };
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  modal: { ondismiss: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

function loadCheckoutScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.Razorpay)));
      existing.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function CheckoutButton({
  planCode,
  planName,
  variant = 'primary',
}: {
  planCode: string;
  planName: string;
  variant?: 'primary' | 'outline';
}) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<CouponResponse | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);

  const verify = useCallback(
    async (payload: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }) => {
      try {
        const result = await api.post<VerifyResponse>('/api/payments/verify', payload);
        if (result.status === 'activated') {
          toast.success('Payment successful', result.message);
          router.push('/dashboard/billing?upgraded=1');
          router.refresh();
        } else if (result.status === 'pending') {
          toast.info('Payment pending', result.message);
          router.push('/dashboard/billing');
        } else {
          toast.error('Payment could not be verified', result.message);
        }
      } catch (error) {
        const message =
          error instanceof ApiClientError
            ? error.message
            : 'We could not confirm the payment. If you were charged, it will be reconciled automatically.';
        toast.error('Verification failed', message);
      } finally {
        setLoading(false);
        setOpen(false);
      }
    },
    [router, toast],
  );

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;

    setCheckingCoupon(true);
    setCouponError(null);
    try {
      const result = await api.post<CouponResponse>('/api/payments/coupon', {
        code,
        planCode,
      });
      setCoupon(result);
      toast.success('Coupon applied', `${result.discountLabel} — you pay ${result.finalAmountLabel}`);
    } catch (error) {
      setCoupon(null);
      setCouponError(
        error instanceof ApiClientError ? error.message : 'That coupon could not be applied.',
      );
    } finally {
      setCheckingCoupon(false);
    }
  }

  async function startCheckout() {
    setLoading(true);

    let order: OrderResponse;
    try {
      order = await api.post<OrderResponse>('/api/payments/order', {
        planCode,
        couponCode: coupon?.code,
      });
    } catch (error) {
      setLoading(false);
      const message =
        error instanceof ApiClientError ? error.message : 'Could not start checkout.';
      toast.error('Checkout unavailable', message);
      return;
    }

    // Local/CI mode: no gateway configured, so run the simulated (but genuinely
    // signed and server-verified) completion path instead of opening Checkout.
    if (order.isMock) {
      try {
        const result = await api.post<VerifyResponse>('/api/payments/mock-complete', {
          orderId: order.orderId,
        });
        toast.success('Test payment completed', result.message);
        router.push('/dashboard/billing?upgraded=1');
        router.refresh();
      } catch (error) {
        const message =
          error instanceof ApiClientError ? error.message : 'The simulated payment failed.';
        toast.error('Test payment failed', message);
      } finally {
        setLoading(false);
        setOpen(false);
      }
      return;
    }

    const scriptReady = await loadCheckoutScript();
    if (!scriptReady || !window.Razorpay) {
      setLoading(false);
      toast.error(
        'Could not load the payment gateway',
        'Check your connection or any ad blockers, then try again.',
      );
      return;
    }

    const checkout = new window.Razorpay({
      key: order.keyId,
      amount: order.amountMinor,
      currency: order.currency,
      name: 'promptduniya',
      description: `${order.planName} membership`,
      order_id: order.orderId,
      prefill: order.prefill,
      theme: { color: '#5b3df5' },
      handler: (response) => void verify(response),
      modal: {
        ondismiss: () => {
          setLoading(false);
          toast.info('Checkout closed', 'Nothing was charged.');
        },
      },
    });

    checkout.open();
  }

  return (
    <>
      <Button
        variant={variant}
        fullWidth
        onClick={() => setOpen(true)}
        leadingIcon={<CrownIcon size={16} />}
      >
        Upgrade to {planName}
      </Button>

      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title={`Upgrade to ${planName}`}
        description="Pay securely with UPI, cards, net banking or wallets."
        size="sm"
        sheet
        footer={
          <Button fullWidth loading={loading} onClick={startCheckout} size="lg">
            {coupon ? `Pay ${coupon.finalAmountLabel}` : 'Continue to payment'}
          </Button>
        }
      >
        <div className="grid gap-4">
          <div className="rounded-xl bg-[var(--surface-sunken)] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-body">{planName} membership</span>
              <span className="font-semibold">{coupon?.originalAmountLabel ?? '—'}</span>
            </div>
            {coupon && (
              <>
                <div className="mt-2 flex items-center justify-between text-sm text-emerald-600 dark:text-emerald-400">
                  <span>Coupon {coupon.code}</span>
                  <span className="font-semibold">−{coupon.discountLabel}</span>
                </div>
                <div className="mt-2.5 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2.5 text-sm font-bold">
                  <span>You pay</span>
                  <span>{coupon.finalAmountLabel}</span>
                </div>
              </>
            )}
            {!coupon && (
              <p className="mt-2 text-xs text-faint">
                The exact amount is confirmed by our server before payment — the final figure appears
                on the payment screen.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Input
              label="Have a coupon?"
              placeholder="ENTER CODE"
              value={couponInput}
              onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
              error={couponError ?? undefined}
              leadingIcon={<TagIcon size={16} />}
              containerClassName="flex-1"
              disabled={Boolean(coupon)}
            />
            {coupon ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckIcon size={14} />
                {coupon.discountLabel} applied
              </p>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={applyCoupon}
                loading={checkingCoupon}
                disabled={couponInput.trim().length < 2}
              >
                Apply coupon
              </Button>
            )}
          </div>

          <p className="text-xs leading-relaxed text-faint">
            Payments are processed by Razorpay. We never see or store your card details. Premium
            access is activated by our server only after the payment signature has been verified.
          </p>
        </div>
      </Modal>
    </>
  );
}

/** Amount formatter re-exported for the billing pages. */
export { formatMoney };
