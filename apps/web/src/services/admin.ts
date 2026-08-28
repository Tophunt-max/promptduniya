import { and, count, desc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import {
  adminLogs,
  comments,
  contactMessages,
  favorites,
  likes,
  plans,
  promptCopies,
  reports,
  roles,
  subscriptions,
  userRoles,
  users,
} from '@/db/schema';
import { AppError } from '@/lib/api';
import { nowSec } from '@/lib/dates';
import { newId } from '@/lib/id';
import { assignRole, removeRole } from './auth';
import { grantPremium, revokePremium } from './subscriptions';

/** Admin-only user management, moderation and the audit trail. */

/* -------------------------------- Audit log -------------------------------- */

export async function logAdminAction(input: {
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
  ipHash?: string;
}): Promise<void> {
  await db.insert(adminLogs).values({
    id: newId(),
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    metaJson: input.meta ? JSON.stringify(input.meta).slice(0, 2000) : null,
    ipHash: input.ipHash ?? null,
  });
}

export async function listAdminLogs(limit = 100) {
  return db
    .select({
      id: adminLogs.id,
      action: adminLogs.action,
      targetType: adminLogs.targetType,
      targetId: adminLogs.targetId,
      metaJson: adminLogs.metaJson,
      createdAt: adminLogs.createdAt,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(adminLogs)
    .leftJoin(users, eq(users.id, adminLogs.actorId))
    .orderBy(desc(adminLogs.createdAt))
    .limit(limit);
}

/* ----------------------------- User management ----------------------------- */

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
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

export async function adminListUsers(options: {
  page?: number;
  pageSize?: number;
  q?: string;
  role?: string;
  premium?: boolean;
  status?: string;
}): Promise<{ items: AdminUserRow[]; total: number; page: number; pageSize: number }> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 25;
  const filters: SQL[] = [];

  if (options.status) filters.push(eq(users.status, options.status));
  if (options.q) {
    const needle = `%${options.q.toLowerCase()}%`;
    filters.push(
      or(
        like(sql`lower(${users.name})`, needle),
        like(users.emailNormalized, needle),
        like(users.username, needle),
      )!,
    );
  }
  if (options.role) {
    filters.push(
      sql`exists (
        select 1 from ${userRoles}
        join ${roles} on ${roles.id} = ${userRoles.roleId}
        where ${userRoles.userId} = ${users.id} and ${roles.name} = ${options.role}
      )`,
    );
  }
  if (options.premium) {
    filters.push(
      sql`exists (
        select 1 from ${subscriptions}
        where ${subscriptions.userId} = ${users.id} and ${subscriptions.status} = 'active'
      )`,
    );
  }

  const where = filters.length > 0 ? and(...filters) : undefined;

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
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

  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return { items: [], total: totals[0]?.value ?? 0, page, pageSize };

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

  return { items, total: totals[0]?.value ?? 0, page, pageSize };
}

export async function adminUpdateUser(input: {
  actorId: string;
  userId: string;
  status?: 'active' | 'suspended';
  roles?: string[];
  grantPremiumDays?: number;
  revokePremium?: boolean;
}): Promise<void> {
  if (input.userId === input.actorId && input.status === 'suspended') {
    throw AppError.badRequest('You cannot suspend your own account');
  }

  const target = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
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

    // Never allow an admin to strip their own admin role (lock-out guard).
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

  return {
    user,
    roles: roleRows.map((r) => r.name),
    stats: {
      likes: likeCount[0]?.value ?? 0,
      saves: saveCount[0]?.value ?? 0,
      copies: copyCount[0]?.value ?? 0,
    },
  };
}

/* -------------------------------- Moderation ------------------------------- */

export async function listReports(status?: string) {
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
    .where(status ? eq(reports.status, status) : undefined)
    .orderBy(desc(reports.createdAt))
    .limit(200);
}

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

export async function resolveReport(input: {
  actorId: string;
  reportId: string;
  status: 'reviewing' | 'resolved' | 'dismissed';
  note?: string;
}): Promise<void> {
  await db
    .update(reports)
    .set({
      status: input.status,
      resolvedBy: input.actorId,
      resolutionNote: input.note ?? null,
      resolvedAt: input.status === 'resolved' || input.status === 'dismissed' ? nowSec() : null,
      updatedAt: nowSec(),
    })
    .where(eq(reports.id, input.reportId));

  await logAdminAction({
    actorId: input.actorId,
    action: `report.${input.status}`,
    targetType: 'report',
    targetId: input.reportId,
  });
}

export async function listComments(status?: string) {
  return db
    .select({
      id: comments.id,
      body: comments.body,
      status: comments.status,
      promptId: comments.promptId,
      articleId: comments.articleId,
      createdAt: comments.createdAt,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.userId))
    .where(status ? eq(comments.status, status) : undefined)
    .orderBy(desc(comments.createdAt))
    .limit(200);
}

export async function moderateComment(input: {
  actorId: string;
  commentId: string;
  status: 'approved' | 'rejected';
}): Promise<void> {
  await db
    .update(comments)
    .set({
      status: input.status,
      moderatedBy: input.actorId,
      moderatedAt: nowSec(),
      updatedAt: nowSec(),
    })
    .where(eq(comments.id, input.commentId));

  await logAdminAction({
    actorId: input.actorId,
    action: `comment.${input.status}`,
    targetType: 'comment',
    targetId: input.commentId,
  });
}

export async function listContactMessages(status?: string) {
  return db
    .select()
    .from(contactMessages)
    .where(status ? eq(contactMessages.status, status) : undefined)
    .orderBy(desc(contactMessages.createdAt))
    .limit(200);
}

export async function updateContactStatus(id: string, status: string): Promise<void> {
  await db.update(contactMessages).set({ status }).where(eq(contactMessages.id, id));
}

export async function saveContactMessage(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
  ipHash: string;
}): Promise<void> {
  await db.insert(contactMessages).values({
    id: newId(),
    name: input.name,
    email: input.email,
    subject: input.subject,
    message: input.message,
    ipHash: input.ipHash,
  });
}

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
