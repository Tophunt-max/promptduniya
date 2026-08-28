'use client';

/**
 * Browser-side API client.
 *
 * Automatically attaches the double-submit CSRF token to every mutating
 * request and normalises the server's `{ ok, data | error }` envelope into a
 * thrown `ApiClientError` so callers can use plain try/catch.
 */

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(payload: ApiErrorPayload, status: number) {
    super(payload.message);
    this.name = 'ApiClientError';
    this.code = payload.code;
    this.status = status;
    this.details = payload.details;
  }

  /** True when the user hit a plan limit and should see an upgrade prompt. */
  get isLimit(): boolean {
    return this.code === 'limit_reached' || this.code === 'payment_required';
  }

  get upgradeHref(): string | null {
    const details = this.details as { upgrade?: string } | undefined;
    return details?.upgrade ?? (this.isLimit ? '/premium' : null);
  }
}

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)pd_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : '';
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['x-csrf-token'] = csrfToken();

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiClientError(
      { code: 'network_error', message: 'You appear to be offline. Check your connection.' },
      0,
    );
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiClientError(
      { code: 'internal_error', message: 'The server sent an unexpected response.' },
      response.status,
    );
  }

  const envelope = payload as
    | { ok: true; data: T; meta?: Record<string, unknown> }
    | { ok: false; error: ApiErrorPayload };

  if (!envelope || typeof envelope !== 'object' || !('ok' in envelope)) {
    throw new ApiClientError(
      { code: 'internal_error', message: 'The server sent an unexpected response.' },
      response.status,
    );
  }

  if (!envelope.ok) throw new ApiClientError(envelope.error, response.status);
  return envelope.data;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};

/** Copies text using the async clipboard API with a legacy fallback. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the textarea approach */
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
