import * as authRepository from './auth.repository.js';
import { hashPassword } from './auth.password.js';
import { signSessionToken, verifySessionToken } from './auth.token.js';
import { sendVerificationEmail } from './auth.mailer.js';
import {
  generateCode, generateToken, hashCode, hashToken, hashesEqual,
  CODE_TTL_SECONDS, TOKEN_TTL_SECONDS, MAX_CODE_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS, MAX_RESENDS,
} from './auth.verification.js';
import { withTransaction } from '../../db/tx.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';

const nowUnix = () => Math.floor(Date.now() / 1000);

/** One message for every dead-code reason so none of them is a distinguishable oracle. */
function codeExpiredError() {
  return new AppError('That code is no longer valid. Request a new one.', {
    statusCode: 403,
    code: 'CODE_EXPIRED',
  });
}

/**
 * Issues a fresh code for an existing verification row and emails it.
 * Fire-and-forget send: SMTP latency must never slow or fail the request that triggered it.
 */
async function issueCode({ verificationId, userId, email, rotate }) {
  const code = generateCode();
  const codeHash = hashCode(code);

  if (rotate) {
    await authRepository.rotateVerificationCode({
      id: verificationId, codeHash, codeTtlSeconds: CODE_TTL_SECONDS,
    });
  }

  void sendVerificationEmail({ to: email, code });
  logger.info({ userId }, 'Verification code issued'); // never logs the code itself
  return { codeHash };
}

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

/**
 * Creates the account and a pending verification. Deliberately does NOT return a session token —
 * the account is unusable until POST /auth/verify succeeds.
 */
export async function register({ name, email, password }) {
  // Hashed OUTSIDE the transaction on purpose: withTransaction checks out one of only 10 pool
  // connections for its whole body, and hashing inside would pin that connection for ~40ms of
  // pure CPU per registration, starving other requests under load.
  const passwordHash = await hashPassword(password);

  const code = generateCode();
  const pendingToken = generateToken();

  const user = await withTransaction(async (db) => {
    const created = await authRepository.createUser({ name, email, passwordHash }, db);
    if (!created) {
      throw new AppError('An account with this email already exists.', {
        statusCode: 409,
        code: 'EMAIL_TAKEN',
      });
    }

    await authRepository.createVerification({
      userId: created.id,
      tokenHash: hashToken(pendingToken),
      codeHash: hashCode(code),
      codeTtlSeconds: CODE_TTL_SECONDS,
      tokenTtlSeconds: TOKEN_TTL_SECONDS,
    }, db);

    return created;
  });

  // Outside the transaction and not awaited — a slow or broken SMTP server must not hold a DB
  // connection open, delay the response, or roll back a successfully created account.
  void sendVerificationEmail({ to: user.email, code });

  return {
    user: toPublicUser(user),
    verification: { token: pendingToken, expiresIn: CODE_TTL_SECONDS },
  };
}

/**
 * Exchanges a correct code for a real session.
 *
 * Runs in a transaction with SELECT ... FOR UPDATE because the attempt counter is the primary
 * defence: a 6-digit code is only 10^6 possibilities, and without row locking two concurrent
 * requests both read attempts=4 and each get a sixth try.
 */
export async function verifyEmail({ token, code, userAgent, ip }) {
  const tokenHash = hashToken(token);

  // NEVER throw inside this transaction on a wrong code.
  //
  // withTransaction rolls back on any throw, which would undo the attempts increment — so every
  // wrong guess would be free and the 5-attempt cap would never engage, leaving a 10^6 space
  // brute-forceable. The transaction therefore RETURNS an outcome and the error is thrown after
  // the commit. (Verified: throwing here recorded attempts=0 after 7 wrong codes.)
  const outcome = await withTransaction(async (db) => {
    const row = await authRepository.findVerificationForUpdate(tokenHash, db);
    const now = nowUnix();

    if (!row || row.consumed_at || row.token_expires_unix <= now) return { status: 'dead' };
    if (row.code_expires_unix <= now || row.attempts >= MAX_CODE_ATTEMPTS) return { status: 'dead' };

    // Counted before the comparison, so a request that dies mid-flight still burns the attempt.
    await authRepository.incrementVerificationAttempts(row.id, db);

    if (!hashesEqual(row.code_hash, hashCode(code))) {
      return { status: 'invalid', attemptsRemaining: Math.max(0, MAX_CODE_ATTEMPTS - (row.attempts + 1)) };
    }

    await authRepository.markVerified({ verificationId: row.id, userId: row.user_id }, db);
    const verified = await authRepository.findUserForVerification(row.user_id, db);
    return { status: 'ok', user: verified };
  });

  if (outcome.status === 'dead') throw codeExpiredError();
  if (outcome.status === 'invalid') {
    throw new AppError('That code is incorrect.', {
      statusCode: 401,
      code: 'CODE_INVALID',
      details: { attemptsRemaining: outcome.attemptsRemaining },
    });
  }

  const { user } = outcome;

  const { token: sessionToken, jti, expiresAtUnix } = signSessionToken(user);
  await authRepository.createSession({ userId: user.id, jti, expiresAtUnix, userAgent, ip });

  return { user: toPublicUser(user), token: sessionToken };
}

/**
 * Rotates the code and re-sends it. Cooldown and cap are enforced from the DB rather than the
 * rate limiter because MemoryStore is per-process and resets on restart — a redeploy would
 * otherwise clear both.
 */
export async function resendCode({ token }) {
  const row = await authRepository.findVerificationByToken(hashToken(token));
  const now = nowUnix();

  if (!row || row.consumed_at || row.token_expires_unix <= now) throw codeExpiredError();

  const sinceLast = now - row.last_sent_unix;
  if (sinceLast < RESEND_COOLDOWN_SECONDS) {
    throw new AppError('Please wait before requesting another code.', {
      statusCode: 429,
      code: 'RESEND_COOLDOWN',
      details: { retryAfter: RESEND_COOLDOWN_SECONDS - sinceLast },
    });
  }

  if (row.resend_count >= MAX_RESENDS) {
    // Without this cap the 5-attempt limit is meaningless: unlimited resends would mean unlimited
    // guesses against a 10^6 space.
    throw new AppError('Too many codes requested. Please try again later.', {
      statusCode: 429,
      code: 'RESEND_LIMIT',
    });
  }

  const user = await authRepository.findUserForVerification(row.user_id);
  if (!user || user.email_verified_at) throw codeExpiredError();

  await issueCode({ verificationId: row.id, userId: row.user_id, email: user.email, rotate: true });
  return { expiresIn: CODE_TTL_SECONDS };
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

  // ORDER IS SECURITY-CRITICAL: this runs only AFTER the password has been verified. Checking
  // verification first — or filtering unverified users out in SQL and returning 403 — would tell
  // anyone who guessed an email that an account exists, re-opening the enumeration hole the
  // uniform 401 above exists to close. Here, the 403 is only ever shown to someone who already
  // proved they know the password.
  if (!user.emailVerifiedAt) {
    // Issue a fresh pending token so the client can go straight to the verify screen. The code is
    // only re-sent if the cooldown has elapsed, so repeated failed logins can't be used to
    // email-bomb the address.
    const pendingToken = generateToken();
    const now = nowUnix();
    const existing = await authRepository.findLiveVerificationByUser(user.id);

    if (existing && !existing.consumed_at && existing.token_expires_unix > now) {
      await authRepository.replaceVerificationToken({
        id: existing.id,
        tokenHash: hashToken(pendingToken),
        tokenTtlSeconds: TOKEN_TTL_SECONDS,
      });
      if (now - existing.last_sent_unix >= RESEND_COOLDOWN_SECONDS
          && existing.resend_count < MAX_RESENDS) {
        await issueCode({
          verificationId: existing.id, userId: user.id, email: user.email, rotate: true,
        });
      }
    } else {
      const code = generateCode();
      await authRepository.consumePriorVerifications(user.id);
      await authRepository.createVerification({
        userId: user.id,
        tokenHash: hashToken(pendingToken),
        codeHash: hashCode(code),
        codeTtlSeconds: CODE_TTL_SECONDS,
        tokenTtlSeconds: TOKEN_TTL_SECONDS,
      });
      void sendVerificationEmail({ to: user.email, code });
    }

    throw new AppError('Please verify your email address to sign in.', {
      statusCode: 403,
      code: 'EMAIL_NOT_VERIFIED',
      details: { verificationToken: pendingToken, expiresIn: CODE_TTL_SECONDS },
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
