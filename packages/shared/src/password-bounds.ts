/**
 * Password length bounds.
 *
 * Kept in @pd/shared with zero dependencies so both the validation schemas and
 * the (server-only) hashing code agree on one definition, and the admin/web
 * clients can validate before a request is ever sent.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;
