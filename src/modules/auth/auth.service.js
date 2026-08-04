import * as authRepository from './auth.repository.js';
import { hashPassword } from './auth.password.js';
import { signSessionToken, verifySessionToken } from './auth.token.js';
import { withTransaction } from '../../db/tx.js';
import { AppError } from '../../utils/AppError.js';

/**
 * The contract's `avatar` is a single uppercase letter, not a URL.
 *
 * Spread twice rather than charAt(0).toUpperCase(): charAt on an astral first character (emoji,
 * some scripts) returns a lone surrogate, and 'ß'.toUpperCase() is 'SS' — two characters where the
 * contract says one letter. name is .trim().min(1) in the schema, so there is always a character.
 */
function avatarFor(name) {
  const [first = ''] = [...name.trim()];
  const [initial = ''] = [...first.toUpperCase()];
  return initial;
}

/** Exactly the contract's four keys — role is deliberately dropped. */
export function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: avatarFor(user.name),
  };
}

export async function register({ name, email, password, userAgent, ip }) {
  // Hashed OUTSIDE the transaction on purpose: withTransaction checks out one of only 10 pool
  // connections for its whole body, and hashing inside would pin that connection for ~40ms of
  // pure CPU per registration, starving other requests under load. The transaction then contains
  // only two fast INSERTs.
  const passwordHash = await hashPassword(password);

  return withTransaction(async (db) => {
    const user = await authRepository.createUser({ name, email, passwordHash }, db);
    if (!user) {
      throw new AppError('An account with this email already exists.', {
        statusCode: 409,
        code: 'EMAIL_TAKEN',
      });
    }

    const { token, jti, expiresAtUnix } = signSessionToken(user);
    await authRepository.createSession({ userId: user.id, jti, expiresAtUnix, userAgent, ip }, db);

    return { user: toPublicUser(user), token };
  });
}

export async function login({ email, password, userAgent, ip }) {
  const user = await authRepository.verifyCredentials({ email, password });

  // One message for "no such email", "wrong password" and "deactivated account" — no enumeration
  // via the response body, matching the fact that there's none via timing either.
  if (!user) {
    throw new AppError('Invalid email or password.', {
      statusCode: 401,
      code: 'BAD_CREDENTIALS',
    });
  }

  const { token, jti, expiresAtUnix } = signSessionToken(user);
  await authRepository.createSession({ userId: user.id, jti, expiresAtUnix, userAgent, ip });

  return { user: toPublicUser(user), token };
}

export async function authenticateToken(token) {
  const payload = verifySessionToken(token); // throws AppError 401
  const user = await authRepository.findLiveSessionByJti(payload.jti);

  // The authoritative identity is the session row's user_id, never the token's sub. A mismatch can
  // only mean a bug, so fail closed. One message covers expired, revoked, unknown-jti and
  // deactivated-user so none of them is a distinguishable oracle.
  if (!user || String(user.id) !== payload.sub) {
    throw new AppError('Your session has expired. Please sign in again.', {
      statusCode: 401,
      code: 'SESSION_INVALID',
    });
  }

  return { user, jti: payload.jti };
}

export async function logout(jti) {
  await authRepository.revokeSession(jti);
}
