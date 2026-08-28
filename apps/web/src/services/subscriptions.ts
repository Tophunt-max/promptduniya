import { apiRequest, query } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth/session';
import { AppError } from '@/lib/api';

/** Membership state, owned by the API. */

export interface SubscriptionView {
  id: string;
  status: string;
  planCode: string;
  planName: string;
  priceMinor: number;
  currency: string;
  billingPeriod: string;
  startDate: number | null;
  endDate: number | null;
  autoRenew: boolean;
  cancelledAt: number | null;
  createdAt: number;
}

export interface AdminSubscriptionRow {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  planName: string;
  planCode: string;
  status: string;
  startDate: number | null;
  endDate: number | null;
  autoRenew: boolean;
  createdAt: number;
}

interface SubscriptionResponse {
  current: SubscriptionView | null;
  history: SubscriptionView[];
}

async function token(): Promise<string> {
  const value = await getAccessToken();
  if (!value) throw AppError.unauthorized();
  return value;
}

async function load(): Promise<SubscriptionResponse> {
  return apiRequest<SubscriptionResponse>('/v1/payments/subscription', { token: await token() });
}

export async function currentSubscription(_userId: string): Promise<SubscriptionView | null> {
  return (await load()).current;
}

export async function subscriptionHistory(_userId: string): Promise<SubscriptionView[]> {
  return (await load()).history;
}

export async function cancelSubscription(
  _userId: string,
  subscriptionId: string,
): Promise<{ autoRenew: false }> {
  await apiRequest('/v1/payments/subscription/cancel', {
    method: 'POST',
    token: await token(),
    body: { subscriptionId },
  });
  return { autoRenew: false };
}

export async function adminListSubscriptions(options: {
  page?: number;
  pageSize?: number;
  status?: string;
}): Promise<{
  items: AdminSubscriptionRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  return apiRequest(
    `/v1/admin/subscriptions${query({
      page: options.page,
      pageSize: options.pageSize,
      status: options.status,
    })}`,
    { token: await token() },
  );
}

/**
 * Maintenance jobs. These run on the API's cron trigger; the website exposes
 * them so the existing `/api/cron/maintenance` route keeps working as a manual
 * kick. Both require the shared cron secret, enforced by the API.
 */
async function runMaintenance(): Promise<{
  published: number;
  trending: number;
  expired: number;
  reminded: number;
}> {
  const { env } = await import('@/lib/env');
  return apiRequest('/v1/cron/maintenance', {
    method: 'POST',
    headers: { 'x-cron-secret': env().CRON_SECRET ?? '' },
  });
}

export async function expireDueSubscriptions(): Promise<number> {
  return (await runMaintenance()).expired;
}

export async function remindExpiringSubscriptions(_days = 5): Promise<number> {
  // The maintenance run performs both jobs; the reminder count is reported here
  // and the expiry count by `expireDueSubscriptions`.
  return (await runMaintenance()).reminded;
}
