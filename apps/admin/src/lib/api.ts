/**
 * API client for the admin SPA.
 *
 * Security model:
 *  - The access token lives in module memory only — never in `localStorage`, so
 *    an XSS cannot read a long-lived credential out of storage.
 *  - The refresh token is an httpOnly cookie set by the API (`SameSite=None`,
 *    `Path=/v1/auth`), so JavaScript can never read it, yet the browser will
 *    replay it to the refresh endpoint. That is what lets a page reload restore
 *    a session without persisting anything ourselves.
 *  - A 401 triggers exactly one refresh-and-retry; a second failure signs out.
 */

export const API_BASE_URL = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://127.0.0.1:8787'
).replace(/\/$/, '');

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(payload: ApiErrorPayload, status: number) {
    super(payload.message);
    this.name = 'ApiError';
    this.code = payload.code;
    this.status = status;
    this.details = payload.details;
  }

  /** Field-level messages from a Zod validation failure, keyed by path. */
  get fieldErrors(): Record<string, string> {
    const details = this.details as { issues?: { path: string; message: string }[] } | undefined;
    const out: Record<string, string> = {};
    for (const issue of details?.issues ?? []) out[issue.path] = issue.message;
    return out;
  }
}

let accessToken: string | null = null;
let onSignedOut: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Registers the callback used when a session can no longer be refreshed. */
export function setSignedOutHandler(handler: (() => void) | null): void {
  onSignedOut = handler;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: ApiErrorPayload;
}

async function parse<T>(response: Response): Promise<Envelope<T> | null> {
  try {
    return (await response.json()) as Envelope<T>;
  } catch {
    return null;
  }
}

async function send(
  method: Method,
  path: string,
  body?: unknown,
  isFormData = false,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';

  return fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    // Needed so the httpOnly refresh cookie is sent to /v1/auth/*.
    credentials: 'include',
    body: isFormData ? (body as FormData) : body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Single-flight refresh: concurrent 401s share one round trip. */
let refreshInFlight: Promise<boolean> | null = null;

export async function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/auth/refresh`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        credentials: 'include',
        body: '{}',
      });
      const payload = await parse<{ accessToken: string }>(response);
      if (!response.ok || !payload?.ok || !payload.data?.accessToken) return false;
      accessToken = payload.data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      // Release the lock on the next tick so late callers still see the result.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  options: { isFormData?: boolean; retry?: boolean } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await send(method, path, body, options.isFormData);
  } catch {
    throw new ApiError(
      { code: 'network_error', message: 'Could not reach the API. Check your connection.' },
      0,
    );
  }

  if (response.status === 401 && options.retry !== false) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(method, path, body, { ...options, retry: false });
    accessToken = null;
    onSignedOut?.();
    throw new ApiError({ code: 'unauthorized', message: 'Your session has expired.' }, 401);
  }

  if (response.status === 204) return undefined as T;

  const payload = await parse<T>(response);
  if (!response.ok || !payload?.ok) {
    throw new ApiError(
      payload?.error ?? { code: 'internal_error', message: 'Something went wrong.' },
      response.status,
    );
  }
  return payload.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  upload: <T>(path: string, form: FormData) =>
    request<T>('POST', path, form, { isFormData: true }),
};

/** Builds a querystring, dropping empty values. */
export function qs(
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
