import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppError } from '@/lib/api';
import { nowSec } from '@/lib/dates';
import { createCoupon, evaluateCoupon, redeemCoupon } from '@/services/coupons';
import { createCheckoutIntent, verifyCheckout } from '@/services/payments';
import { MockProvider, setPaymentProvider } from '@/services/payments/provider';
import { getPlanByCode } from '@/services/plans';
import type { PlanView } from '@/services/plans';
import {
  countRows,
  createTestUser,
  resetDatabase,
  seedRoles,
  seedTestPlans,
} from './helpers';

let monthly: PlanView;
let lifetime: PlanView;
let adminId: string;
let provider: MockProvider;

beforeEach(async () => {
  await resetDatabase();
  await seedRoles();
  await seedTestPlans();

  monthly = (await getPlanByCode('monthly'))!;
  lifetime = (await getPlanByCode('lifetime'))!;
  adminId = (await createTestUser({ roleNames: ['admin', 'user'] })).id;

  provider = new MockProvider('test_mock_secret_key');
  setPaymentProvider(provider);
});

afterEach(() => {
  setPaymentProvider(null);
});

describe('coupon validation', () => {
  it('applies a percentage discount', async () => {
    await createCoupon(
      {
        code: 'SAVE20',
        discountType: 'percentage',
        percentage: 20,
        perUserLimit: 1,
        applicablePlans: [],
        minAmountMinor: 0,
        isActive: true,
      },
      adminId,
    );

    const user = await createTestUser();
    const result = await evaluateCoupon({ code: 'SAVE20', plan: monthly, userId: user.id });

    expect(result.discountMinor).toBe(1_980); // 20% of 9900
    expect(result.finalAmountMinor).toBe(7_920);
    expect(result.discountLabel).toBe('20% off');
  });

  it('applies a fixed discount', async () => {
    await createCoupon(
      {
        code: 'FLAT50',
        discountType: 'fixed',
        amountMinor: 5_000,
        perUserLimit: 1,
        applicablePlans: [],
        minAmountMinor: 0,
        isActive: true,
      },
      adminId,
    );

    const user = await createTestUser();
    const result = await evaluateCoupon({ code: 'FLAT50', plan: monthly, userId: user.id });

    expect(result.discountMinor).toBe(5_000);
    expect(result.finalAmountMinor).toBe(4_900);
  });

  it('is case-insensitive on the code', async () => {
    await createCoupon(
      {
        code: 'MixedCase',
        discountType: 'percentage',
        percentage: 10,
        perUserLimit: 1,
        applicablePlans: [],
        minAmountMinor: 0,
        isActive: true,
      },
      adminId,
    );

    const user = await createTestUser();
    await expect(
      evaluateCoupon({ code: 'mixedcase', plan: monthly, userId: user.id }),
    ).resolves.toBeTruthy();
  });

  it('never lets a discount reduce the charge below ₹1', async () => {
    await createCoupon(
      {
        code: 'HUGE',
        discountType: 'fixed',
        // More than the plan price.
        amountMinor: 50_000,
        perUserLimit: 1,
        applicablePlans: [],
        minAmountMinor: 0,
        isActive: true,
      },
      adminId,
    );

    const user = await createTestUser();
    const result = await evaluateCoupon({ code: 'HUGE', plan: monthly, userId: user.id });

    expect(result.finalAmountMinor).toBeGreaterThanOrEqual(100);
    expect(result.discountMinor).toBe(monthly.priceMinor - 100);
  });

  it('rejects an unknown code', async () => {
    const user = await createTestUser();
    await expect(
      evaluateCoupon({ code: 'NOPE', plan: monthly, userId: user.id }),
    ).rejects.toThrow(/not valid/i);
  });

  it('rejects an inactive coupon', async () => {
    await createCoupon(
      {
        code: 'DISABLED',
        discountType: 'percentage',
        percentage: 50,
        perUserLimit: 1,
        applicablePlans: [],
        minAmountMinor: 0,
        isActive: false,
      },
      adminId,
    );

    const user = await createTestUser();
    await expect(
      evaluateCoupon({ code: 'DISABLED', plan: monthly, userId: user.id }),
    ).rejects.toThrow(/not valid/i);
  });

  it('rejects a coupon that has not started', async () => {
    await createCoupon(
      {
        code: 'FUTURE',
        discountType: 'percentage',
        percentage: 25,
        startDate: nowSec() + 86_400,
        perUserLimit: 1,
        applicablePlans: [],
        minAmountMinor: 0,
        isActive: true,
      },
      adminId,
    );

    const user = await createTestUser();
    await expect(
      evaluateCoupon({ code: 'FUTURE', plan: monthly, userId: user.id }),
    ).rejects.toThrow(/not active yet/i);
  });

  it('rejects an expired coupon', async () => {
    await createCoupon(
      {
        code: 'EXPIRED',
        discountType: 'percentage',
        percentage: 25,
        endDate: nowSec() - 60,
        perUserLimit: 1,
        applicablePlans: [],
        minAmountMinor: 0,
        isActive: true,
      },
      adminId,
    );

    const user = await createTestUser();
    await expect(
      evaluateCoupon({ code: 'EXPIRED', plan: monthly, userId: user.id }),
    ).rejects.toThrow(/expired/i);
  });

  it('rejects a coupon that is not applicable to the plan', async () => {
    await createCoupon(
      {
        code: 'LIFEONLY',
        discountType: 'percentage',
        percentage: 15,
        perUserLimit: 1,
        applicablePlans: ['lifetime'],
        minAmountMinor: 0,
        isActive: true,
      },
      adminId,
    );

    const user = await createTestUser();

    await expect(
      evaluateCoupon({ code: 'LIFEONLY', plan: monthly, userId: user.id }),
    ).rejects.toThrow(/does not apply/i);

    await expect(
      evaluateCoupon({ code: 'LIFEONLY', plan: lifetime, userId: user.id }),
    ).resolves.toBeTruthy();
  });

  it('enforces the minimum order amount', async () => {
    await createCoupon(
      {
        code: 'BIGORDER',
        discountType: 'percentage',
        percentage: 30,
        perUserLimit: 1,
        applicablePlans: [],
        minAmountMinor: 100_000,
        isActive: true,
      },
      adminId,
    );

    const user = await createTestUser();

    await expect(
      evaluateCoupon({ code: 'BIGORDER', plan: monthly, userId: user.id }),
    ).rejects.toThrow(/minimum order/i);

    await expect(
      evaluateCoupon({ code: 'BIGORDER', plan: lifetime, userId: user.id }),
    ).resolves.toBeTruthy();
  });

  it('enforces the total usage limit', async () => {
    const coupon = await createCoupon(
      {
        code: 'ONEONLY',
        discountType: 'percentage',
        percentage: 50,
        usageLimit: 1,
        perUserLimit: 5,
        applicablePlans: [],
        minAmountMinor: 0,
        isActive: true,
      },
      adminId,
    );

    const first = await createTestUser();
    const second = await createTestUser();

    await evaluateCoupon({ code: 'ONEONLY', plan: monthly, userId: first.id });
    await redeemCoupon({
      couponId: coupon.id,
      userId: first.id,
      paymentId: null,
      discountMinor: 4_950,
    });

    await expect(
      evaluateCoupon({ code: 'ONEONLY', plan: monthly, userId: second.id }),
    ).rejects.toThrow(/usage limit/i);
  });

  it('enforces the per-user limit', async () => {
    const coupon = await createCoupon(
      {
        code: 'ONCEEACH',
        discountType: 'percentage',
        percentage: 10,
        perUserLimit: 1,
        applicablePlans: [],
        minAmountMinor: 0,
        isActive: true,
      },
      adminId,
    );

    const user = await createTestUser();
    const other = await createTestUser();

    await redeemCoupon({
      couponId: coupon.id,
      userId: user.id,
      paymentId: null,
      discountMinor: 990,
    });

    await expect(
      evaluateCoupon({ code: 'ONCEEACH', plan: monthly, userId: user.id }),
    ).rejects.toThrow(/already used/i);

    // A different user is unaffected.
    await expect(
      evaluateCoupon({ code: 'ONCEEACH', plan: monthly, userId: other.id }),
    ).resolves.toBeTruthy();
  });

  it('refuses to create two coupons with the same code', async () => {
    await createCoupon(
      {
        code: 'UNIQUE',
        discountType: 'percentage',
        percentage: 10,
        perUserLimit: 1,
        applicablePlans: [],
        minAmountMinor: 0,
        isActive: true,
      },
      adminId,
    );

    await expect(
      createCoupon(
        {
          code: 'unique',
          discountType: 'percentage',
          percentage: 20,
          perUserLimit: 1,
          applicablePlans: [],
          minAmountMinor: 0,
          isActive: true,
        },
        adminId,
      ),
    ).rejects.toThrow(AppError);
  });
});

describe('coupons at checkout', () => {
  it('creates the order at the discounted amount', async () => {
    await createCoupon(
      {
        code: 'CHECKOUT25',
        discountType: 'percentage',
        percentage: 25,
        perUserLimit: 1,
        applicablePlans: [],
        minAmountMinor: 0,
        isActive: true,
      },
      adminId,
    );

    const user = await createTestUser();
    const intent = await createCheckoutIntent({
      userId: user.id,
      planCode: 'monthly',
      couponCode: 'CHECKOUT25',
    });

    expect(intent.discountMinor).toBe(2_475);
    expect(intent.amountMinor).toBe(7_425);
    expect(intent.couponCode).toBe('CHECKOUT25');
  });

  it('records a redemption only once the payment is captured', async () => {
    await createCoupon(
      {
        code: 'REDEEMONCE',
        discountType: 'percentage',
        percentage: 10,
        perUserLimit: 1,
        applicablePlans: [],
        minAmountMinor: 0,
        isActive: true,
      },
      adminId,
    );

    const user = await createTestUser();
    const intent = await createCheckoutIntent({
      userId: user.id,
      planCode: 'monthly',
      couponCode: 'REDEEMONCE',
    });

    // Nothing redeemed yet — the order exists but is unpaid.
    expect(await countRows('coupon_redemptions')).toBe(0);

    const handler = await provider.simulateSuccess(intent.orderId);
    await verifyCheckout({
      userId: user.id,
      orderId: handler.razorpay_order_id,
      paymentId: handler.razorpay_payment_id,
      signature: handler.razorpay_signature,
    });

    expect(await countRows('coupon_redemptions')).toBe(1);
  });

  it('rejects an invalid coupon at order creation', async () => {
    const user = await createTestUser();
    await expect(
      createCheckoutIntent({ userId: user.id, planCode: 'monthly', couponCode: 'FAKECODE' }),
    ).rejects.toThrow(/not valid/i);
  });
});
