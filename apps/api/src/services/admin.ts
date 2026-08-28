import {
  adminLogs,
  comments,
  contactMessages,
  db,
  reports,
  roles,
  userRoles,
  users,
} from '@pd/db';
import { and, count, desc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';

import { AppError } from '../lib/errors';
import { newId, hashIp } from '../lib/crypto';
import { nowSec } from '../lib/dates';

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
  createdAt: number;
  lastLoginAt: number | null;
}

export async function adminListUsers(query: {
  q?: string;
  status?: string;
  role?: string;
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

  const ids = rows.map((r) => r.id);
  const roleRows = ids.length
    ? await db
        .select({ userId: userRoles.userId, name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(inArray(userRoles.userId, ids))
    : [];
  const rolesByUser = new Map<string, string[]>();
  for (const r of roleRows) {
    const list = rolesByUser.get(r.userId) ?? [];
    list.push(r.name);
    rolesByUser.set(r.userId, list);
  }

  let items = rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    username: r.username,
    status: r.status,
    emailVerified: r.emailVerifiedAt !== null,
    roles: rolesByUser.get(r.id) ?? [],
    createdAt: r.createdAt,
    lastLoginAt: r.lastLoginAt,
  }));

  if (query.role) items = items.filter((u) => u.roles.includes(query.role!));

  return { items, total: totals[0]?.value ?? 0, page, pageSize };
}

export async function adminSetUserStatus(userId: string, status: 'active' | 'suspended' | 'deleted') {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!existing[0]) throw AppError.notFound('User not found');
  await db.update(users).set({ status, updatedAt: nowSec() }).where(eq(users.id, userId));
}

export async function adminSetUserRoles(userId: string, roleNames: string[]): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!existing[0]) throw AppError.notFound('User not found');
  const clean = Array.from(new Set(['user', ...roleNames.map((r) => r.trim()).filter(Boolean)]));
  await db.delete(userRoles).where(eq(userRoles.userId, userId));
  for (const name of clean) {
    const roleId = await roleIdByName(name);
    await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing();
  }
}

async function roleIdByName(name: string): Promise<string> {
  const rows = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, name)).limit(1);
  if (rows[0]) return rows[0].id;
  const id = newId();
  await db.insert(roles).values({ id, name, description: `${name} role` });
  return id;
}

/* ============================ Moderation ============================== */

export async function listReports(status?: string) {
  const where = status ? eq(reports.status, status) : undefined;
  return db.select().from(reports).where(where).orderBy(desc(reports.createdAt)).limit(200);
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
      userName: users.name,
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
