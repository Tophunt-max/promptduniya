import { ErrorCodes, type ErrorCode } from '@pd/shared';

/**
 * Domain error carried up to the Hono error handler, which turns it into the
 * standard `{ ok: false, error }` envelope with the right HTTP status.
 */
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
  static paymentFailed(message = 'Payment could not be verified') {
    return new AppError(ErrorCodes.PAYMENT_FAILED, message, 400);
  }
  static internal(message = 'Something went wrong on our side') {
    return new AppError(ErrorCodes.INTERNAL, message, 500);
  }
}
