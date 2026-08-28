import {
  adminLogs,
  comments,
  contactMessages,
  db,
  favorites,
  likes,
  plans,
  promptCopies,
  reports,
  roles,
  subscriptions,
  userRoles,
  users,
} from '@pd/db';
import { and, count, desc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';

import { AppError } from '../lib/errors';
import { newId, hashIp } from '../lib/crypto';
import { nowSec } from '../lib/dates';
import { grantPremium, revokePremium } from './subscriptions';

/**
 * Admin-only operations: audit logging, user management and content moderation.
 * Every mutating action is recorded in `admin_logs` for an audit trail.
 */

export interface LogInput {
  actorId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
}

export async function logAdminAction(input: LogInput): Promise<void> {
  await db.insert(adminLogs).values({
    id: newId(),
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    metaJson: input.meta ? JSON.stringify(input.meta) : null,
    ipHash: input.ip ? hashIp(input.ip) : null,
  });
}

export async function listAdminLogs(options: { page?: number; pageSize?: number } = {}) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 50;
  return db
    .select({
      id: adminLogs.id,
      actorId: adminLogs.actorId,
      actorName: users.name,
      action: adminLogs.action,
      targetType: adminLogs.targetType,
      targetId: adminLogs.targetId,
      metaJson: adminLogs.metaJson,
      createdAt: adminLogs.createdAt,
    })
    .from(adminLogs)
    .leftJoin(users, eq(users.id, adminLogs.actorId))
    .orderBy(desc(adminLogs.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
}

/* ============================== Users ================================= */

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  username: string;
  status: string;
  emailVerified: boolean;
  roles: string[];
  planName: string | null;
  subscriptionStatus: string | null;
  subscriptionEndsAt: number | null;
  copies: number;
  saves: number;
  createdAt: number;
  lastLoginAt: number | null;
}

export async function adminListUsers(query: {
  q?: string;
  status?: string;
  role?: string;
  premium?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<{ items: AdminUserRow[]; total: number; page: number; pageSize: number }> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  const filters: SQL[] = [];

  if (query.status) filters.push(eq(users.status, query.status));
  if (query.q && query.q.trim()) {
    const needle = `%${query.q.trim().toLowerCase()}%`;
    filters.push(
      or(
        like(users.emailNormalized, needle),
        like(sql`lower(${users.name})`, needle),
        like(users.username, needle),
      )!,
    );
  }
  // Role and premium filters run as correlated EXISTS so paging stays correct.
  if (query.role) {
    filters.push(
      sql`exists (
        select 1 from ${userRoles}
        join ${roles} on ${roles.id} = ${userRoles.roleId}
        where ${userRoles.userId} = ${users.id} and ${roles.name} = ${query.role}
      )`,
    );
  }
  if (query.premium) {
    filters.push(
      sql`exists (
        select 1 from ${subscriptions}
        where ${subscriptions.userId} = ${users.id} and ${subscriptions.status} = 'active'
      )`,
    );
  }

  const where = filters.length ? and(...filters) : undefined;

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        username: users.username,
        status: users.status,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(users).where(where),
  ]);

  const total = totals[0]?.value ?? 0;
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return { items: [], total, page, pageSize };

  const [roleRows, subRows, copyRows, saveRows] = await Promise.all([
    db
      .select({ userId: userRoles.userId, name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(inArray(userRoles.userId, ids)),
    db
      .select({
        userId: subscriptions.userId,
        status: subscriptions.status,
        endDate: subscriptions.endDate,
        planName: plans.name,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(and(inArray(subscriptions.userId, ids), eq(subscriptions.status, 'active'))),
    db
      .select({ userId: promptCopies.userId, value: count() })
      .from(promptCopies)
      .where(inArray(promptCopies.userId, ids))
      .groupBy(promptCopies.userId),
    db
      .select({ userId: favorites.userId, value: count() })
      .from(favorites)
      .where(inArray(favorites.userId, ids))
      .groupBy(favorites.userId),
  ]);

  const roleMap = new Map<string, string[]>();
  for (const row of roleRows) {
    roleMap.set(row.userId, [...(roleMap.get(row.userId) ?? []), row.name]);
  }
  const subMap = new Map(subRows.map((r) => [r.userId, r]));
  const copyMap = new Map(copyRows.map((r) => [r.userId ?? '', r.value]));
  const saveMap = new Map(saveRows.map((r) => [r.userId, r.value]));

  const items: AdminUserRow[] = rows.map((row) => {
    const sub = subMap.get(row.id);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      username: row.username,
      status: row.status,
      emailVerified: row.emailVerifiedAt !== null,
      roles: roleMap.get(row.id) ?? [],
      planName: sub?.planName ?? null,
      subscriptionStatus: sub?.status ?? null,
      subscriptionEndsAt: sub?.endDate ?? null,
      copies: copyMap.get(row.id) ?? 0,
      saves: saveMap.get(row.id) ?? 0,
      createdAt: row.createdAt,
      lastLoginAt: row.lastLoginAt,
    };
  });

  return { items, total, page, pageSize };
}

async function roleIdByName(name: string): Promise<string> {
  const rows = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, name)).limit(1);
  if (rows[0]) return rows[0].id;
  const id = newId();
  await db.insert(roles).values({ id, name, description: `${name} role` });
  return id;
}

async function assignRole(userId: string, roleName: string): Promise<void> {
  const roleId = await roleIdByName(roleName);
  await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing();
}

async function removeRole(userId: string, roleName: string): Promise<void> {
  const roleId = await roleIdByName(roleName);
  await db.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
}

/**
 * Single entry point for admin edits to an account.
 *
 * Carries two lock-out guards: an admin can neither suspend their own account
 * nor strip their own admin role, so a mis-click can never leave the platform
 * without an administrator.
 */
export async function adminUpdateUser(input: {
  actorId: string;
  userId: string;
  status?: 'active' | 'suspended';
  roles?: string[];
  grantPremiumDays?: number;
  revokePremium?: boolean;
  ip?: string | null;
}): Promise<void> {
  if (input.userId === input.actorId && input.status === 'suspended') {
    throw AppError.badRequest('You cannot suspend your own account');
  }

  const target = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!target[0]) throw AppError.notFound('User not found');

  if (input.status) {
    await db
      .update(users)
      .set({ status: input.status, updatedAt: nowSec() })
      .where(eq(users.id, input.userId));
  }

  if (input.roles) {
    const currentRows = await db
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, input.userId));
    const current = new Set(currentRows.map((r) => r.name));
    const next = new Set(input.roles);

    if (input.userId === input.actorId && current.has('admin') && !next.has('admin')) {
      throw AppError.badRequest('You cannot remove your own administrator role');
    }

    for (const role of next) if (!current.has(role)) await assignRole(input.userId, role);
    for (const role of current) if (!next.has(role)) await removeRole(input.userId, role);
  }

  if (input.grantPremiumDays) {
    await grantPremium({ userId: input.userId, days: input.grantPremiumDays });
  }
  if (input.revokePremium) {
    await revokePremium(input.userId);
  }

  await logAdminAction({
    actorId: input.actorId,
    action: 'user.update',
    targetType: 'user',
    targetId: input.userId,
    ip: input.ip,
    meta: {
      status: input.status,
      roles: input.roles,
      grantPremiumDays: input.grantPremiumDays,
      revokePremium: input.revokePremium,
    },
  });
}

export async function adminUserDetail(userId: string) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) throw AppError.notFound('User not found');

  const [roleRows, likeCount, saveCount, copyCount] = await Promise.all([
    db
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, userId)),
    db.select({ value: count() }).from(likes).where(eq(likes.userId, userId)),
    db.select({ value: count() }).from(favorites).where(eq(favorites.userId, userId)),
    db.select({ value: count() }).from(promptCopies).where(eq(promptCopies.userId, userId)),
  ]);

  // The password hash must never leave the API.
  const { passwordHash: _hash, ...safeUser } = user;

  return {
    user: safeUser,
    roles: roleRows.map((r) => r.name),
    stats: {
      likes: likeCount[0]?.value ?? 0,
      saves: saveCount[0]?.value ?? 0,
      copies: copyCount[0]?.value ?? 0,
    },
  };
}

/* ============================ Moderation ============================== */

export async function listReports(status?: string) {
  const where = status ? eq(reports.status, status) : undefined;
  return db
    .select({
      id: reports.id,
      targetType: reports.targetType,
      targetId: reports.targetId,
      reason: reports.reason,
      details: reports.details,
      status: reports.status,
      createdAt: reports.createdAt,
      reporterName: users.name,
      reporterEmail: users.email,
    })
    .from(reports)
    .leftJoin(users, eq(users.id, reports.reporterId))
    .where(where)
    .orderBy(desc(reports.createdAt))
    .limit(200);
}

export async function resolveReport(
  id: string,
  input: { status: 'reviewing' | 'resolved' | 'dismissed'; resolvedBy: string; note?: string },
) {
  const existing = await db.select({ id: reports.id }).from(reports).where(eq(reports.id, id)).limit(1);
  if (!existing[0]) throw AppError.notFound('Report not found');
  await db
    .update(reports)
    .set({
      status: input.status,
      resolvedBy: input.resolvedBy,
      resolutionNote: input.note ?? null,
      resolvedAt: input.status === 'resolved' || input.status === 'dismissed' ? nowSec() : null,
      updatedAt: nowSec(),
    })
    .where(eq(reports.id, id));
}

export async function listComments(status?: string) {
  const where = status ? eq(comments.status, status) : undefined;
  return db
    .select({
      id: comments.id,
      promptId: comments.promptId,
      articleId: comments.articleId,
      body: comments.body,
      status: comments.status,
      authorName: users.name,
      authorEmail: users.email,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.userId))
    .where(where)
    .orderBy(desc(comments.createdAt))
    .limit(200);
}

export async function moderateComment(
  id: string,
  input: { status: 'approved' | 'rejected'; moderatorId: string },
) {
  const existing = await db.select({ id: comments.id }).from(comments).where(eq(comments.id, id)).limit(1);
  if (!existing[0]) throw AppError.notFound('Comment not found');
  await db
    .update(comments)
    .set({
      status: input.status,
      moderatedBy: input.moderatorId,
      moderatedAt: nowSec(),
      updatedAt: nowSec(),
    })
    .where(eq(comments.id, id));
}

export async function listContactMessages(status?: string) {
  const where = status ? eq(contactMessages.status, status) : undefined;
  return db
    .select()
    .from(contactMessages)
    .where(where)
    .orderBy(desc(contactMessages.createdAt))
    .limit(200);
}

export async function setContactMessageStatus(
  id: string,
  status: 'new' | 'read' | 'replied' | 'spam',
) {
  const existing = await db
    .select({ id: contactMessages.id })
    .from(contactMessages)
    .where(eq(contactMessages.id, id))
    .limit(1);
  if (!existing[0]) throw AppError.notFound('Message not found');
  await db.update(contactMessages).set({ status }).where(eq(contactMessages.id, id));
}


/* ------------------- Public submissions (reports / contact) ---------------- */

export async function createReport(input: {
  reporterId: string | null;
  targetType: string;
  targetId: string;
  reason: string;
  details?: string;
}): Promise<void> {
  await db.insert(reports).values({
    id: newId(),
    reporterId: input.reporterId,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    details: input.details ?? null,
  });
}

export async function saveContactMessage(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
  ip?: string | null;
}): Promise<void> {
  await db.insert(contactMessages).values({
    id: newId(),
    name: input.name,
    email: input.email,
    subject: input.subject,
    message: input.message,
    ipHash: input.ip ? hashIp(input.ip) : null,
  });
}

/** Badge counts for the admin dashboard. */
export async function pendingModerationCounts() {
  const [reportRows, commentRows, contactRows] = await Promise.all([
    db.select({ value: count() }).from(reports).where(eq(reports.status, 'open')),
    db.select({ value: count() }).from(comments).where(eq(comments.status, 'pending')),
    db.select({ value: count() }).from(contactMessages).where(eq(contactMessages.status, 'new')),
  ]);

  return {
    openReports: reportRows[0]?.value ?? 0,
    pendingComments: commentRows[0]?.value ?? 0,
    newMessages: contactRows[0]?.value ?? 0,
  };
}
