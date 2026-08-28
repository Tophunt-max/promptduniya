import { apiRequest, query } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import { AppError } from '@/lib/api';

/** In-app notifications and delivery preferences, served by the API. */

export interface PreferenceRow {
  newPremiumPrompts: boolean;
  newTrendingPrompts: boolean;
  subscriptionUpdates: boolean;
  paymentUpdates: boolean;
  productUpdates: boolean;
  emailEnabled: boolean;
}

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  icon: string | null;
  readAt: number | null;
  createdAt: number;
}

interface NotificationsResponse {
  items: NotificationRow[];
  unread: number;
  preferences: PreferenceRow;
}

async function token(): Promise<string> {
  const value = await getAccessToken();
  if (!value) throw AppError.unauthorized();
  return value;
}

async function load(limit = 30): Promise<NotificationsResponse> {
  return apiRequest<NotificationsResponse>(`/v1/viewer/notifications${query({ limit })}`, {
    token: await token(),
  });
}

export async function listNotifications(
  _userId: string,
  limit = 30,
): Promise<NotificationRow[]> {
  return (await load(limit)).items;
}

/**
 * Unread badge count. Resolves to 0 for signed-out visitors rather than
 * throwing, because the layout renders this on every page.
 */
export async function unreadCount(_userId?: string): Promise<number> {
  const value = await getAccessToken();
  if (!value) return 0;
  try {
    const extras = await apiRequest<{ unreadNotifications: number }>('/v1/viewer/extras', {
      token: value,
    });
    return extras.unreadNotifications;
  } catch {
    return 0;
  }
}

export async function markRead(_userId: string, notificationId?: string): Promise<void> {
  await apiRequest('/v1/viewer/notifications', {
    method: 'PATCH',
    token: await token(),
    body: { notificationId },
  });
}

export async function getPreferences(_userId: string): Promise<PreferenceRow> {
  return (await load(1)).preferences;
}

export async function updatePreferences(
  _userId: string,
  patch: Partial<PreferenceRow>,
): Promise<PreferenceRow> {
  return apiRequest<PreferenceRow>('/v1/viewer/notifications/preferences', {
    method: 'PUT',
    token: await token(),
    body: patch,
  });
}
