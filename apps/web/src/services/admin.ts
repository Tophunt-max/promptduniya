import { apiRequest, query } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import { AppError } from '@/lib/api';

/**
 * Admin user management, moderation and the audit trail — all delegated to the
 * API worker, which re-checks the caller's role on every request. The website
 * never grants itself admin rights; it only forwards the bearer token.
 */

async function token(): Promise<string> {
  const value = await getAccessToken();
  if (!value) throw AppError.unauthorized();
  return value;
}

/* -------------------------------- Audit log -------------------------------- */

export interface AdminLogRow {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metaJson: string | null;
  createdAt: number;
  actorName: string | null;
}

/**
 * Audit entries are written by the API as a side effect of each admin mutation,
 * so this is a no-op kept for signature compatibility with the monolith.
 */
export async function logAdminAction(_input: {
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
  ipHash?: string;
}): Promise<void> {
  void _input;
}

export async function listAdminLogs(limit = 100): Promise<AdminLogRow[]> {
  const data = await apiRequest<{ items: AdminLogRow[] }>(
    `/v1/admin/logs${query({ pageSize: limit })}`,
    { token: await token() },
  );
  return data.items;
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
  return apiRequest(
    `/v1/admin/users${query({
      page: options.page,
      pageSize: options.pageSize,
      q: options.q,
      role: options.role,
      premium: options.premium ? 1 : undefined,
      status: options.status,
    })}`,
    { token: await token() },
  );
}

export async function adminUpdateUser(input: {
  actorId: string;
  userId: string;
  status?: 'active' | 'suspended';
  roles?: string[];
  grantPremiumDays?: number;
  revokePremium?: boolean;
}): Promise<void> {
  await apiRequest(`/v1/admin/users/${encodeURIComponent(input.userId)}`, {
    method: 'PATCH',
    token: await token(),
    body: {
      status: input.status,
      roles: input.roles,
      grantPremiumDays: input.grantPremiumDays,
      revokePremium: input.revokePremium,
    },
  });
}

export interface AdminUserDetail {
  user: {
    id: string;
    email: string;
    name: string;
    username: string;
    avatarUrl: string | null;
    bio: string | null;
    status: string;
    emailVerifiedAt: number | null;
    createdAt: number;
    lastLoginAt: number | null;
  };
  roles: string[];
  stats: { likes: number; saves: number; copies: number };
}

export async function adminUserDetail(userId: string): Promise<AdminUserDetail> {
  return apiRequest(`/v1/admin/users/${encodeURIComponent(userId)}`, { token: await token() });
}

/* -------------------------------- Moderation ------------------------------- */

export interface ReportRow {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: number;
  reporterName: string | null;
  reporterEmail: string | null;
}

export async function listReports(status?: string): Promise<ReportRow[]> {
  const data = await apiRequest<{ items: ReportRow[] }>(`/v1/admin/reports${query({ status })}`, {
    token: await token(),
  });
  return data.items;
}

/** Public submission — works for signed-out visitors, so no bearer token. */
export async function createReport(input: {
  reporterId: string | null;
  targetType: string;
  targetId: string;
  reason: string;
  details?: string;
}): Promise<void> {
  await apiRequest('/v1/catalog/reports', {
    method: 'POST',
    token: await getAccessToken(),
    body: {
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      details: input.details,
    },
  });
}

export async function resolveReport(input: {
  actorId: string;
  reportId: string;
  status: 'reviewing' | 'resolved' | 'dismissed';
  note?: string;
}): Promise<void> {
  await apiRequest(`/v1/admin/reports/${encodeURIComponent(input.reportId)}`, {
    method: 'PATCH',
    token: await token(),
    body: { status: input.status, note: input.note },
  });
}

export interface CommentRow {
  id: string;
  body: string;
  status: string;
  promptId: string | null;
  articleId: string | null;
  createdAt: number;
  authorName: string | null;
  authorEmail: string | null;
}

export async function listComments(status?: string): Promise<CommentRow[]> {
  const data = await apiRequest<{ items: CommentRow[] }>(`/v1/admin/comments${query({ status })}`, {
    token: await token(),
  });
  return data.items;
}

export async function moderateComment(input: {
  actorId: string;
  commentId: string;
  status: 'approved' | 'rejected';
}): Promise<void> {
  await apiRequest(`/v1/admin/comments/${encodeURIComponent(input.commentId)}`, {
    method: 'PATCH',
    token: await token(),
    body: { status: input.status },
  });
}

export interface ContactMessageRow {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  createdAt: number;
}

export async function listContactMessages(status?: string): Promise<ContactMessageRow[]> {
  const data = await apiRequest<{ items: ContactMessageRow[] }>(
    `/v1/admin/contact-messages${query({ status })}`,
    { token: await token() },
  );
  return data.items;
}

export async function updateContactStatus(id: string, status: string): Promise<void> {
  await apiRequest(`/v1/admin/contact-messages/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    token: await token(),
    body: { status },
  });
}

/** Public submission — the contact form is open to anonymous visitors. */
export async function saveContactMessage(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
  ipHash?: string;
}): Promise<void> {
  await apiRequest('/v1/catalog/contact', {
    method: 'POST',
    body: {
      name: input.name,
      email: input.email,
      subject: input.subject,
      message: input.message,
    },
  });
}

export async function pendingModerationCounts(): Promise<{
  openReports: number;
  pendingComments: number;
  newMessages: number;
}> {
  return apiRequest('/v1/admin/moderation/counts', { token: await token() });
}
