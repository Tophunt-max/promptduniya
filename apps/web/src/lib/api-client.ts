import { AppError, ErrorCodes, type ErrorCode } from './api';
import { env } from './env';

/**
 * Server-side client for the promptduniya API worker.
 *
 * The website is a BFF: it never touches the database. Every read and write
 * goes through this client, which speaks to the API worker over either
 *
 *  - a Cloudflare **service binding** (zero-latency, stays inside Cloudflare's
 *    network and never traverses the public internet), or
 *  - plain **HTTP** against `API_BASE_URL` (local `next dev`, Node hosting).
 *
 * Responses use the same `{ ok, data | error }` envelope as the website's own
 * route handlers, so an API failure is rethrown as the identical `AppError`
 * the rest of the codebase already handles. That keeps every existing route
 * handler and client-side error path working unchanged.
 */

/** A Cloudflare service binding is anything with a `fetch`. */
export interface ApiBinding {
  fetch(request: Request): Promise<Response>;
}

interface BindingHolder {
  __PD_API_BINDING?: ApiBinding;
}

/**
 * Registers the service binding. Called by the Cloudflare adapter's entry
 * shim; a no-op elsewhere, where the HTTP transport is used instead.
 */
export function setApiBinding(binding: ApiBinding | null): void {
  const holder = globalThis as unknown as BindingHolder;
  if (binding) holder.__PD_API_BINDING = binding;
  else delete holder.__PD_API_BINDING;
}

function apiBinding(): ApiBinding | null {
  return (globalThis as unknown as BindingHolder).__PD_API_BINDING ?? null;
}

/**
 * Base URL for the HTTP transport. When a service binding is in play the host
 * is irrelevant (the binding ignores it) but a valid absolute URL is still
 * required to construct a `Request`.
 */
function baseUrl(): string {
  return env().API_BASE_URL.replace(/\/$/, '');
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Bearer access token to forward; omit for anonymous calls. */
  token?: string | null;
  /** Extra headers, e.g. the caller's IP so the API rate-limits correctly. */
  headers?: Record<string, string>;
  /**
   * Next.js fetch cache hint. Only honoured by the HTTP transport — service
   * bindings bypass the Next data cache, so SSG pages should be built with the
   * HTTP transport or rely on route-level `revalidate`.
   */
  revalidate?: number | false;
  /** Cache tags for on-demand revalidation. */
  tags?: string[];
  /** Treat 404 as `null` instead of throwing. */
  allowNotFound?: boolean;
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
  meta?: Record<string, unknown>;
}

const KNOWN_CODES = new Set<string>(Object.values(ErrorCodes));

function toAppError(
  payload: Envelope<unknown> | null,
  status: number,
  fallbackMessage: string,
): AppError {
  const raw = payload?.error;
  const code: ErrorCode =
    raw && KNOWN_CODES.has(raw.code) ? (raw.code as ErrorCode) : ErrorCodes.UPSTREAM;
  return new AppError(code, raw?.message ?? fallbackMessage, status, raw?.details);
}

/**
 * Performs one API call and unwraps the envelope.
 *
 * Throws `AppError` on any non-ok response so callers can use plain
 * try/catch and the shared `handle()` wrapper produces the right HTTP status.
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const url = `${baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;

  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const init: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } } = {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  };

  const binding = apiBinding();
  let response: Response;

  try {
    if (binding) {
      response = await binding.fetch(new Request(url, init));
    } else {
      // Mutations must never be cached; reads opt in explicitly.
      if (method === 'GET' && (options.revalidate !== undefined || options.tags)) {
        init.next = {
          ...(options.revalidate !== undefined ? { revalidate: options.revalidate } : {}),
          ...(options.tags ? { tags: options.tags } : {}),
        };
      } else if (method !== 'GET') {
        init.cache = 'no-store';
      }
      response = await fetch(url, init);
    }
  } catch (error) {
    console.error(`[api-client] ${method} ${path} transport failure:`, error);
    throw new AppError(ErrorCodes.UPSTREAM, 'The service is temporarily unreachable.', 503);
  }

  if (response.status === 204) return undefined as T;

  let payload: Envelope<T> | null = null;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    if (response.status === 404 && options.allowNotFound) return null as T;
    throw toAppError(payload, response.status, 'The service returned an unexpected response.');
  }

  return payload.data as T;
}

/**
 * Like `apiRequest` but also hands back the raw `Response`.
 *
 * Needed by the auth flow, which has to read the rotated refresh token out of
 * the API's `Set-Cookie` header. A server-to-server fetch can inspect that
 * header directly, so the refresh token never has to be exposed in a JSON body
 * where browser JavaScript could read it.
 */
export async function apiRequestRaw<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<{ data: T; response: Response }> {
  const method = options.method ?? 'GET';
  const url = `${baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;

  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const init: RequestInit = {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  };

  const binding = apiBinding();
  let response: Response;
  try {
    response = binding ? await binding.fetch(new Request(url, init)) : await fetch(url, init);
  } catch (error) {
    console.error(`[api-client] ${method} ${path} transport failure:`, error);
    throw new AppError(ErrorCodes.UPSTREAM, 'The service is temporarily unreachable.', 503);
  }

  let payload: Envelope<T> | null = null;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    throw toAppError(payload, response.status, 'The service returned an unexpected response.');
  }

  return { data: payload.data as T, response };
}

/** GET helper that resolves to `null` on 404 rather than throwing. */
export async function apiGetOptional<T>(
  path: string,
  options: Omit<ApiRequestOptions, 'method' | 'allowNotFound'> = {},
): Promise<T | null> {
  return apiRequest<T | null>(path, { ...options, method: 'GET', allowNotFound: true });
}

/**
 * Builds a querystring from a loose record, dropping empty values so the API
 * sees only the filters that were actually set.
 */
export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
