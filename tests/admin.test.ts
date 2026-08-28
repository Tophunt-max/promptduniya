import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { getDb } from '@/db';
import { roles, userRoles, users } from '@/db/schema';
import { AppError } from '@/lib/api';
import { SETTING_KEYS } from '@/lib/constants';
import { adminListUsers, adminUpdateUser, listAdminLogs, logAdminAction } from '@/services/admin';
import { deleteCategory, createCategory, updateCategory } from '@/services/categories';
import { resolveAccess } from '@/services/entitlements';
import { deletePlan, getPlanByCode, upsertPlan } from '@/services/plans';
import { getNumberSetting, setSettings } from '@/services/settings';
import { grantPremium, revokePremium } from '@/services/subscriptions';
import {
  createTestCategory,
  createTestPrompt,
  createTestUser,
  resetDatabase,
  seedRoles,
  seedTestPlans,
} from './helpers';

let adminId: string;

beforeEach(async () => {
  await resetDatabase();
  await seedRoles();
  await seedTestPlans();
  adminId = (await createTestUser({ roleNames: ['admin', 'user'] })).id;
});

/** Reads a user's roles straight from the join table. */
async function rolesFor(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  return rows.map((row) => row.name).sort();
}

describe('admin user management', () => {
  it('suspends and reinstates an account', async () => {
    const member = await createTestUser();

    await adminUpdateUser({ actorId: adminId, userId: member.id, status: 'suspended' });
    let rows = await getDb().select().from(users).where(eq(users.id, member.id));
    expect(rows[0]?.status).toBe('suspended');

    await adminUpdateUser({ actorId: adminId, userId: member.id, status: 'active' });
    rows = await getDb().select().from(users).where(eq(users.id, member.id));
    expect(rows[0]?.status).toBe('active');
  });

  it('refuses to let an admin suspend themselves', async () => {
    await expect(
      adminUpdateUser({ actorId: adminId, userId: adminId, status: 'suspended' }),
    ).rejects.toThrow(/cannot suspend your own account/i);
  });

  it('refuses to let an admin remove their own admin role', async () => {
    await expect(
      adminUpdateUser({ actorId: adminId, userId: adminId, roles: ['user'] }),
    ).rejects.toThrow(/cannot remove your own administrator role/i);

    // The role must still be intact after the rejected attempt.
    expect(await rolesFor(adminId)).toContain('admin');
  });

  it('adds and removes roles on another account', async () => {
    const member = await createTestUser();

    await adminUpdateUser({ actorId: adminId, userId: member.id, roles: ['editor', 'user'] });
    expect(await rolesFor(member.id)).toEqual(['editor', 'user']);

    await adminUpdateUser({ actorId: adminId, userId: member.id, roles: ['user'] });
    expect(await rolesFor(member.id)).toEqual(['user']);
  });

  it('rejects an unknown user', async () => {
    await expect(
      adminUpdateUser({ actorId: adminId, userId: 'no-such-user', status: 'suspended' }),
    ).rejects.toThrow(AppError);
  });

  it('grants premium as a real, date-bounded subscription', async () => {
    const member = await createTestUser();

    await adminUpdateUser({ actorId: adminId, userId: member.id, grantPremiumDays: 30 });

    const access = await resolveAccess(member.id);
    expect(access.isPremium).toBe(true);
    expect(access.subscriptionEndsAt).toBeGreaterThan(0);
  });

  it('revokes premium', async () => {
    const member = await createTestUser();
    await grantPremium({ userId: member.id, days: 30 });
    expect((await resolveAccess(member.id)).isPremium).toBe(true);

    await revokePremium(member.id);
    expect((await resolveAccess(member.id)).isPremium).toBe(false);
  });

  it('lists users with their roles and plan', async () => {
    const member = await createTestUser({ name: 'Listed Member' });
    await grantPremium({ userId: member.id, days: 30 });

    const result = await adminListUsers({ page: 1, pageSize: 25 });
    const listed = result.items.find((row) => row.id === member.id);

    expect(listed?.name).toBe('Listed Member');
    expect(listed?.planName).toBeTruthy();
    expect(listed?.roles).toContain('user');
  });

  it('filters the user list to premium members', async () => {
    const free = await createTestUser();
    const premium = await createTestUser();
    await grantPremium({ userId: premium.id, days: 30 });

    const result = await adminListUsers({ premium: true });
    const ids = result.items.map((row) => row.id);

    expect(ids).toContain(premium.id);
    expect(ids).not.toContain(free.id);
  });
});

describe('audit log', () => {
  it('records role and premium changes', async () => {
    const member = await createTestUser();
    await adminUpdateUser({
      actorId: adminId,
      userId: member.id,
      roles: ['editor', 'user'],
      grantPremiumDays: 7,
    });

    const logs = await listAdminLogs(20);
    const entry = logs.find((row) => row.action === 'user.update');

    expect(entry).toBeTruthy();
    expect(entry?.targetId).toBe(member.id);
    expect(entry?.metaJson).toContain('editor');
  });

  it('stores the actor and structured metadata', async () => {
    await logAdminAction({
      actorId: adminId,
      action: 'test.action',
      targetType: 'thing',
      targetId: 'thing-1',
      meta: { detail: 'value' },
    });

    const logs = await listAdminLogs(5);
    const entry = logs.find((row) => row.action === 'test.action');

    expect(entry?.actorEmail).toBeTruthy();
    expect(entry?.metaJson).toContain('value');
  });
});

describe('plan management', () => {
  it('changes a price and the change is what checkout will read', async () => {
    await upsertPlan({
      code: 'monthly',
      name: 'Monthly',
      priceMinor: 14_900,
      currency: 'INR',
      billingPeriod: 'month',
      intervalCount: 1,
      trialDays: 0,
      features: ['Unlimited copies'],
      limits: { copiesPerDay: -1, favorites: -1, generatorPerDay: -1 },
      isActive: true,
      isPopular: true,
      sortOrder: 1,
    });

    const plan = await getPlanByCode('monthly');
    expect(plan?.priceMinor).toBe(14_900);
  });

  it('refuses to delete the free plan', async () => {
    const free = await getPlanByCode('free');
    await expect(deletePlan(free!.id)).rejects.toThrow(/free plan cannot be deleted/i);
  });

  it('deactivates rather than hard-deletes a paid plan', async () => {
    const monthly = await getPlanByCode('monthly');
    await deletePlan(monthly!.id);

    const after = await getPlanByCode('monthly');
    expect(after).toBeTruthy();
    expect(after?.isActive).toBe(false);
  });
});

describe('category management', () => {
  it('creates a category with a unique slug', async () => {
    const first = await createCategory({ name: 'Street Style' });
    const second = await createCategory({ name: 'Street Style' });

    expect(first.slug).toBe('street-style');
    expect(second.slug).not.toBe(first.slug);
  });

  it('refuses to delete a category that still has prompts', async () => {
    const categoryId = await createTestCategory('Busy');
    await createTestPrompt({ categoryId, authorId: adminId });

    await expect(deleteCategory(categoryId)).rejects.toThrow(/still has prompts/i);
  });

  it('deletes an empty category', async () => {
    const created = await createCategory({ name: 'Temporary' });
    await expect(deleteCategory(created.id)).resolves.toBeUndefined();
  });

  it('refuses to make a category its own parent', async () => {
    const created = await createCategory({ name: 'Parentable' });

    await expect(
      updateCategory(created.id, { name: 'Parentable', parentId: created.id }),
    ).rejects.toThrow(/own parent/i);
  });
});

describe('runtime settings', () => {
  it('persists a changed limit and reads it back', async () => {
    await setSettings({ [SETTING_KEYS.freeCopiesPerDay]: 42 }, adminId);
    expect(await getNumberSetting(SETTING_KEYS.freeCopiesPerDay, 10)).toBe(42);
  });

  it('applies a changed limit to access resolution immediately', async () => {
    const member = await createTestUser();

    await setSettings({ [SETTING_KEYS.freeCopiesPerDay]: 7 }, adminId);
    const access = await resolveAccess(member.id);

    expect(access.limits.copiesPerDay).toBe(7);
  });

  it('supports -1 for unlimited', async () => {
    const member = await createTestUser();
    await setSettings({ [SETTING_KEYS.freeCopiesPerDay]: -1 }, adminId);

    const access = await resolveAccess(member.id);
    expect(access.limits.copiesPerDay).toBe(-1);
  });
});
