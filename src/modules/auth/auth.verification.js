import { createHmac, randomInt, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';

export const CODE_LENGTH = 6;
export const CODE_TTL_SECONDS = 10 * 60;        // code lifetime
export const TOKEN_TTL_SECONDS = 24 * 60 * 60;  // pending-token lifetime, outlives the code
export const MAX_CODE_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_RESENDS = 10;

/**
 * A purpose-specific key derived from JWT_SECRET rather than a second secret to manage.
 *
 * The label gives domain separation: this key cannot be used to forge JWTs and a future rotation
 * of the code key doesn't force a rotation of every live session token. Versioned so the label
 * can be bumped to invalidate all outstanding codes without touching JWT_SECRET.
 */
const CODE_KEY = createHmac('sha256', env.JWT_SECRET)
  .update('email-verification-code-v1')
  .digest();

/**
 * HMAC, not bare SHA-256. A 6-digit code has only 10^6 candidates, so a plain digest is
 * reversible by exhaustive search in milliseconds if this table ever leaks. Keying it means a
 * leaked database is useless without JWT_SECRET. Same speed, same column width.
 */
export function hashCode(code) {
  return createHmac('sha256', CODE_KEY).update(String(code)).digest('hex');
}

/** The pending token is high-entropy, so a plain digest is fine — nothing to brute force. */
export function hashToken(token) {
  return createHmac('sha256', CODE_KEY).update(String(token)).digest('hex');
}

/** crypto.randomInt is CSPRNG-backed; Math.random is not and must never be used for a credential. */
export function generateCode() {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

export function generateToken() {
  return randomBytes(32).toString('hex');
}

/**
 * Constant-time comparison of two hex digests.
 *
 * Both are HMAC-SHA256 output so they are always 32 bytes — timingSafeEqual throws on a length
 * mismatch, and the guard below keeps a malformed stored value from turning a wrong code into a
 * 500. Comparing digests rather than raw codes means an early-exit compare could at worst leak a
 * digest prefix, which is not invertible; this is belt-and-braces on top of that.
 */
export function hashesEqual(a, b) {
  const left = Buffer.from(String(a), 'hex');
  const right = Buffer.from(String(b), 'hex');
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}
