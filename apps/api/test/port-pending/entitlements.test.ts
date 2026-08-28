import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import { subscriptions } from '@/db/schema';
import { FEATURES } from '@/lib/constants';
import { nowSec } from '@/lib/dates';
import { AppError } from '@/lib/api';
import {
  assertFeature,
  copyUsage,
  deactivatePremium,
  favoriteUsage,
  hasFeature,
  rateMultiplier,
  resolveAccess,
} from '@/services/entitlements';
import {
  createTestUser,
  grantTestPremium,
  resetDatabase,
  seedRoles,
  seedTestPlans,
  setTestLimits,
} from './helpers';

/**
 * These tests exist to prove the security property that matters most:
 * premium access is derived from subscription state, not from a stored boolean.
 */
describe('premium access resolution', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRoles();
    await seedTestPlans();
    await setTestLimits();
  });

  it('treats an anonymous visitor as a guest with guest limits', async () => {
    const access = await resolveAccess(null);

    expect(access.isAuthenticated).toBe(false);
    expect(access.isPremium).toBe(false);
    expect(access.planCode).toBe('anonymous');
    expect(access.limits.copiesPerDay).toBe(1);
    expect(access.features.size).toBe(0);
  });

  it('treats a signed-in user with no subscription as free', async () => {
    const user = await createTestUser();
    const access = await resolveAccess(user.id);

    expect(access.isAuthenticated).toBe(true);
    expect(access.isPremium).toBe(false);
    expect(access.planCode).toBe('free');
    expect(access.limits.copiesPerDay).toBe(3);
    expect(hasFeature(access, FEATURES.premiumPrompts)).toBe(false);
  });

  it('grants premium features from an active subscription', async () => {
    const user = await createTestUser();
    await grantTestPremium(user.id, 'monthly');

    const access = await resolveAccess(user.id);

    expect(access.isPremium).toBe(true);
    expect(access.planCode).toBe('monthly');
    expect(hasFeature(access, FEATURES.premiumPrompts)).toBe(true);
    expect(hasFeature(access, FEATURES.advancedGenerator)).toBe(true);
    expect(hasFeature(access, FEATURES.adFree)).toBe(true);
    expect(access.limits.copiesPerDay).toBe(-1);
  });

  it('denies premium when the subscription has expired, even with a cached flag', async () => {
    const user = await createTestUser();
    const subscriptionId = await grantTestPremium(user.id, 'monthly');

    // Backdate the end date. `users.premium_cached_until` is deliberately left
    // untouched to prove the resolver does not trust it.
    await getDb()
      .update(subscriptions)
      .set({ endDate: nowSec() - 60 })
      .where(eq(subscriptions.id, subscriptionId));

    const access = await resolveAccess(user.id);

    expect(access.isPremium).toBe(false);
    expect(hasFeature(access, FEATURES.premiumPrompts)).toBe(false);
    expect(access.limits.copiesPerDay).toBe(3);
  });

  it('denies premium when the subscription is cancelled', async () => {
    const user = await createTestUser();
    const subscriptionId = await grantTestPremium(user.id, 'monthly');

    await getDb()
      .update(subscriptions)
      .set({ status: 'cancelled' })
      .where(eq(subscriptions.id, subscriptionId));

    const access = await resolveAccess(user.id);
    expect(access.isPremium).toBe(false);
  });

  it('treats a lifetime subscription with no end date as active', async () => {
    const user = await createTestUser();
    await grantTestPremium(user.id, 'lifetime');

    await getDb()
      .update(subscriptions)
      .set({ endDate: null })
      .where(eq(subscriptions.userId, user.id));

    const access = await resolveAccess(user.id);
    expect(access.isPremium).toBe(true);
    expect(access.subscriptionEndsAt).toBeNull();
  });

  it('revokes features when premium is deactivated', async () => {
    const user = await createTestUser();
    await grantTestPremium(user.id, 'monthly');
    expect((await resolveAccess(user.id)).isPremium).toBe(true);

    await deactivatePremium(user.id);
    // The subscription row still exists, so we cancel it as the service does.
    await getDb()
      .update(subscriptions)
      .set({ status: 'cancelled' })
      .where(eq(subscriptions.userId, user.id));

    const access = await resolveAccess(user.id);
    expect(access.isPremium).toBe(false);
    expect(hasFeature(access, FEATURES.premiumPrompts)).toBe(false);
  });

  it('throws a 402 from assertFeature when the feature is absent', async () => {
    const user = await createTestUser();
    const access = await resolveAccess(user.id);

    expect(() => assertFeature(access, FEATURES.premiumPrompts)).toThrow(AppError);
    try {
      assertFeature(access, FEATURES.premiumPrompts);
    } catch (error) {
      expect((error as AppError).status).toBe(402);
    }
  });

  it('scales rate limits by tier', async () => {
    const guest = await resolveAccess(null);
    const free = await resolveAccess((await createTestUser()).id);

    const premiumUser = await createTestUser();
    await grantTestPremium(premiumUser.id, 'monthly');
    const premium = await resolveAccess(premiumUser.id);

    expect(rateMultiplier(guest)).toBe(1);
    expect(rateMultiplier(free)).toBe(2);
    expect(rateMultiplier(premium)).toBe(4);
  });
});

describe('usage counters', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRoles();
    await seedTestPlans();
    await setTestLimits({ freeCopies: 3, freeFavorites: 2 });
  });

  it('reports the configured free limits before any usage', async () => {
    const user = await createTestUser();
    const access = await resolveAccess(user.id);

    const copies = await copyUsage(access, null);
    expect(copies.used).toBe(0);
    expect(copies.limit).toBe(3);
    expect(copies.allowed).toBe(true);
    expect(copies.unlimited).toBe(false);

    const favorites = await favoriteUsage(access);
    expect(favorites.limit).toBe(2);
  });

  it('reports unlimited usage for premium members', async () => {
    const user = await createTestUser();
    await grantTestPremium(user.id, 'monthly');
    const access = await resolveAccess(user.id);

    const copies = await copyUsage(access, null);
    expect(copies.unlimited).toBe(true);
    expect(copies.allowed).toBe(true);

    const favorites = await favoriteUsage(access);
    expect(favorites.unlimited).toBe(true);
  });
});
