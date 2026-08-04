import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';

/**
 * 7 days, as a module constant rather than an env var.
 *
 * CLAUDE.md's "all config from env.js" governs values that vary per deployment (hosts,
 * credentials, ports, origins). This expiry is a contract decision — CLAUDE.md and
 * docs/backend-plan.md §1.3 both state 7 days. Promoting it to env would create a silent security
 * knob (someone sets 365d in prod and nothing complains) and let it drift from the
 * sessions.expires_at write. One constant used by both sites can't drift. JWT_SECRET is correctly
 * an env var because it's a credential.
 */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Returns the token plus the values the session row needs, so both come from ONE clock reading —
 * that's what makes sessions.expires_at equal the JWT exp by construction rather than by luck.
 *
 * The payload carries sub/role/jti only. No email or name: a JWT payload is base64, not encrypted.
 */
export function signSessionToken({ id, role }) {
  const jti = randomUUID(); // 36 chars — fits sessions.jti CHAR(36) exactly
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + SESSION_TTL_SECONDS;

  // Explicit exp rather than the expiresIn option — jsonwebtoken rejects both together.
  const token = jwt.sign(
    { sub: String(id), role, jti, iat, exp },
    env.JWT_SECRET,
    { algorithm: 'HS256' },
  );

  return { token, jti, expiresAtUnix: exp };
}

export function verifySessionToken(token) {
  try {
    // Pinning algorithms is the algorithm-confusion defence and costs one option.
    return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    // Every failure mode (expired, bad signature, malformed) collapses to one message. Never
    // surface "invalid signature" — it's a probing oracle, and `message` renders verbatim to users.
    throw new AppError('Your session has expired. Please sign in again.', {
      statusCode: 401,
      code: 'SESSION_INVALID',
    });
  }
}
