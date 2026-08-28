import { NextResponse } from 'next/server';
import { ZodError, type ZodTypeAny, type z } from 'zod';

/** Consistent JSON envelope for every API route. */
export type ApiSuccess<T> = { ok: true; data: T; meta?: Record<string, unknown> };
export type ApiFailure = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const ErrorCodes = {
  BAD_REQUEST: 'bad_request',
  VALIDATION: 'validation_error',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  LIMIT_REACHED: 'limit_reached',
  RATE_LIMITED: 'rate_limited',
  PAYMENT_REQUIRED: 'payment_required',
  PAYMENT_FAILED: 'payment_failed',
  UPSTREAM: 'upstream_error',
  INTERNAL: 'internal_error',
  MAINTENANCE: 'maintenance',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** Thrown by services; converted into a proper HTTP response by `handle()`. */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static badRequest(message = 'Invalid request', details?: unknown) {
    return new AppError(ErrorCodes.BAD_REQUEST, message, 400, details);
  }
  static unauthorized(message = 'You need to sign in to continue') {
    return new AppError(ErrorCodes.UNAUTHORIZED, message, 401);
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new AppError(ErrorCodes.FORBIDDEN, message, 403);
  }
  static notFound(message = 'Not found') {
    return new AppError(ErrorCodes.NOT_FOUND, message, 404);
  }
  static conflict(message = 'That already exists') {
    return new AppError(ErrorCodes.CONFLICT, message, 409);
  }
  static limitReached(message: string, details?: unknown) {
    return new AppError(ErrorCodes.LIMIT_REACHED, message, 403, details);
  }
  static rateLimited(message = 'Too many requests. Please slow down.', details?: unknown) {
    return new AppError(ErrorCodes.RATE_LIMITED, message, 429, details);
  }
  static paymentRequired(message = 'This is a premium feature') {
    return new AppError(ErrorCodes.PAYMENT_REQUIRED, message, 402);
  }
  static internal(message = 'Something went wrong on our side') {
    return new AppError(ErrorCodes.INTERNAL, message, 500);
  }
}

export function ok<T>(data: T, meta?: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>({ ok: true, data, ...(meta ? { meta } : {}) }, init);
}

export function created<T>(data: T, meta?: Record<string, unknown>) {
  return ok(data, meta, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function fail(code: ErrorCode, message: string, status: number, details?: unknown) {
  return NextResponse.json<ApiFailure>(
    { ok: false, error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

function zodDetails(error: ZodError) {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

/**
 * Wraps a route handler: converts thrown AppError/ZodError into the standard
 * envelope and prevents internal error details from leaking to clients.
 */
export function handle<A extends unknown[]>(
  fn: (...args: A) => Promise<NextResponse> | NextResponse,
) {
  return async (...args: A): Promise<NextResponse> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof AppError) {
        return fail(error.code, error.message, error.status, error.details);
      }
      if (error instanceof ZodError) {
        return fail(ErrorCodes.VALIDATION, 'Please check the highlighted fields', 422, {
          issues: zodDetails(error),
        });
      }
      console.error('[api] unhandled error:', error);
      return fail(ErrorCodes.INTERNAL, 'Something went wrong on our side', 500);
    }
  };
}

/**
 * Parses and validates a JSON request body.
 *
 * Generic over the schema (not its output) so `.default()` and `.transform()`
 * produce the parsed output type rather than the looser input type.
 */
export async function parseBody<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw AppError.badRequest('Request body must be valid JSON');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AppError(ErrorCodes.VALIDATION, 'Please check the highlighted fields', 422, {
      issues: zodDetails(result.error),
    });
  }
  return result.data;
}

/** Parses and validates query parameters from a URL. */
export function parseQuery<S extends ZodTypeAny>(request: Request, schema: S): z.output<S> {
  const url = new URL(request.url);
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    raw[key] = values.length > 1 ? values : values[0]!;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AppError(ErrorCodes.VALIDATION, 'Invalid query parameters', 422, {
      issues: zodDetails(result.error),
    });
  }
  return result.data;
}

/** Best-effort client IP extraction behind proxies/CDNs. */
export function clientIp(request: Request): string {
  const headers = request.headers;
  const candidates = [
    headers.get('cf-connecting-ip'),
    headers.get('x-real-ip'),
    headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
  ];
  return candidates.find((c) => c && c.length > 0) ?? '127.0.0.1';
}
