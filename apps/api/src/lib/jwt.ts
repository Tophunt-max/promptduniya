import { SignJWT, jwtVerify } from 'jose';

import type { AccessTokenClaims } from '@pd/shared';
import { config } from './env';

/**
 * Stateless access tokens (JWT, HS256) for cross-origin auth.
 *
 * The website and admin live on different origins from the API, so a
 * same-origin cookie is not enough. Short-lived access tokens carry the
 * claims; a long-lived refresh token lives in KV (see services/auth) and is
 * revocable. The signing key is `AUTH_SECRET`.
 */

function key(): Uint8Array {
  return new TextEncoder().encode(config().authSecret);
}

const ISSUER = 'promptduniya-api';
const AUDIENCE = 'promptduniya';

export async function signAccessToken(claims: AccessTokenClaims): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = config().accessTokenMinutes * 60;
  const token = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${config().accessTokenMinutes}m`)
    .sign(key());
  return { token, expiresIn };
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return payload as unknown as AccessTokenClaims;
  } catch {
    return null;
  }
}
