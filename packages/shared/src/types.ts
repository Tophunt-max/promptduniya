/**
 * Wire types shared by the API and both frontends.
 *
 * The API always answers with this envelope, so the web and admin clients can
 * unwrap it identically.
 */

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

/** JWT access-token claims issued by the API. */
export interface AccessTokenClaims {
  sub: string; // user id
  email: string;
  name: string;
  username: string;
  roles: string[];
  isAdmin: boolean;
  isEditor: boolean;
  emailVerified: boolean;
  /** Session id, so a token can be tied to a revocable session. */
  sid: string;
}

export interface AuthResult {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  user: {
    id: string;
    email: string;
    name: string;
    username: string;
    avatarUrl: string | null;
    roles: string[];
    isAdmin: boolean;
    isEditor: boolean;
    emailVerified: boolean;
  };
}
