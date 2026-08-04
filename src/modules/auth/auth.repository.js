import { pool } from '../../db/pool.js';
import { verifyPassword, dummyHash } from './auth.password.js';

const USER_PUBLIC_COLUMNS = 'id, name, email, role';
const DEFAULT_ROLE = 'customer'; // mirrors the users.role column default

/**
 * Inserts a user, or returns null if the email is taken.
 *
 * No pre-check SELECT: two concurrent registrations would both pass it and one would then 500.
 * Instead let the uq_users_email unique index decide and catch the duplicate. `users` has exactly
 * one unique key, so errno 1062 unambiguously means "email taken" — no sqlMessage string-sniffing.
 * Returning null instead of throwing keeps the mysql2 error code inside the repository (the only
 * layer allowed to know the driver exists) and lets the service own the HTTP meaning.
 *
 * MySQL rolls back only the failing statement on 1062, so the surrounding transaction stays usable.
 */
export async function createUser({ name, email, passwordHash }, db = pool) {
  try {
    const [result] = await db.execute(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, passwordHash, DEFAULT_ROLE],
    );
    return { id: result.insertId, name, email, role: DEFAULT_ROLE };
  } catch (err) {
    if (err.errno === 1062) return null;
    throw err;
  }
}

/**
 * Returns the user if the credentials are valid, else null.
 *
 * Index: uq_users_email (unique, const access). is_active is in the WHERE clause on purpose so a
 * deactivated account follows the identical code path to a nonexistent one — no faster branch to
 * distinguish them by.
 */
export async function verifyCredentials({ email, password }, db = pool) {
  // email_verified_at is SELECTed but deliberately NOT filtered on in the WHERE clause. Filtering
  // would make an unverified account indistinguishable from a wrong password (generic 401), and
  // the contract needs a distinct 403. The service decides — but only AFTER the password checks
  // out, so the 403 never reveals account existence to someone without the password.
  const [rows] = await db.execute(
    `SELECT ${USER_PUBLIC_COLUMNS}, email_verified_at, password_hash
     FROM users WHERE email = ? AND is_active = 1 LIMIT 1`,
    [email],
  );

  const row = rows[0];

  // TIMING-SAFE — DO NOT "OPTIMISE" THIS.
  // When the email is unknown we still run a full argon2 verify against a throwaway hash, so an
  // unknown email and a known email with a wrong password take the same time. Hoisting an
  // `if (!row) return null;` above this line looks like it removes dead work, but it reinstates
  // a timing oracle that lets an attacker enumerate which emails have accounts.
  // The result is consumed by the decision below, so nothing can elide the call.
  const ok = await verifyPassword(row?.password_hash ?? await dummyHash(), password);
  if (!row || !ok) return null;

  // Built field by field, never spread — password_hash must not leave this file.
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    emailVerifiedAt: row.email_verified_at,
  };
}

/**
 * FROM_UNIXTIME(?) rather than passing a JS Date: pool.js sets no `timezone`, so mysql2 would
 * format a Date in the Node process timezone while NOW() (used by findLiveSessionByJti) evaluates
 * in the MySQL session timezone. If those differ — containerized app, managed DB — every session
 * is silently born hours early or late. Converting server-side keeps both in one frame.
 *
 * user_agent/ip are truncated to their column widths here. Not optional: real User-Agent strings
 * routinely exceed 255 bytes, and MySQL strict mode turns that into error 1406, i.e. every login
 * from that browser 500s.
 */
export async function createSession({ userId, jti, expiresAtUnix, userAgent, ip }, db = pool) {
  await db.execute(
    `INSERT INTO sessions (user_id, jti, expires_at, user_agent, ip)
     VALUES (?, ?, FROM_UNIXTIME(?), ?, ?)`,
    [
      userId,
      jti,
      expiresAtUnix,
      userAgent ? String(userAgent).slice(0, 255) : null,
      ip ? String(ip).slice(0, 45) : null,
    ],
  );
}

/**
 * The hottest query in the app — one per authenticated request.
 *
 * Indexes: uq_sessions_jti gives const access on sessions, then the join hits users on PRIMARY via
 * the FK. Two index dives, one row, no filesort. Because revocation is checked in the same query
 * that fetches the user, it costs zero extra round trips (docs/backend-plan.md §1.3).
 */
export async function findLiveSessionByJti(jti, db = pool) {
  const [rows] = await db.execute(
    `SELECT u.id, u.name, u.email, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.jti = ?
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
       AND u.is_active = 1
       AND u.email_verified_at IS NOT NULL
     LIMIT 1`,
    [jti],
  );
  return rows[0] ?? null;
}

/** Idempotent — affectedRows of 0 means it was already revoked. Index: uq_sessions_jti. */
export async function revokeSession(jti, db = pool) {
  const [result] = await db.execute(
    'UPDATE sessions SET revoked_at = NOW() WHERE jti = ? AND revoked_at IS NULL',
    [jti],
  );
  return result.affectedRows;
}

/* ── Email verification ──────────────────────────────────────────────── */

const VERIFICATION_COLUMNS = `id, user_id, code_hash, attempts, resend_count,
  UNIX_TIMESTAMP(code_expires_at)  AS code_expires_unix,
  UNIX_TIMESTAMP(token_expires_at) AS token_expires_unix,
  UNIX_TIMESTAMP(last_sent_at)     AS last_sent_unix,
  consumed_at`;

/** Retires any live verification for a user so only one code is ever valid at a time. */
export async function consumePriorVerifications(userId, db = pool) {
  await db.execute(
    'UPDATE email_verifications SET consumed_at = NOW() WHERE user_id = ? AND consumed_at IS NULL',
    [userId],
  );
}

export async function createVerification(
  { userId, tokenHash, codeHash, codeTtlSeconds, tokenTtlSeconds },
  db = pool,
) {
  // FROM_UNIXTIME-style server-side arithmetic (NOW() + INTERVAL) for the same reason
  // createSession uses FROM_UNIXTIME: expiry must be evaluated in the MySQL timezone, because
  // that's the frame NOW() uses when these rows are later read back.
  await db.execute(
    `INSERT INTO email_verifications
       (user_id, token_hash, code_hash, code_expires_at, token_expires_at, last_sent_at)
     VALUES (?, ?, ?, NOW() + INTERVAL ? SECOND, NOW() + INTERVAL ? SECOND, NOW())`,
    [userId, tokenHash, codeHash, codeTtlSeconds, tokenTtlSeconds],
  );
}

/**
 * Locks the row for the duration of the caller's transaction.
 *
 * FOR UPDATE is load-bearing: without it two concurrent verify requests both read attempts=4 and
 * each get a "6th" try, defeating the attempt cap. Index: uq_ev_token (const access).
 */
export async function findVerificationForUpdate(tokenHash, db = pool) {
  const [rows] = await db.execute(
    `SELECT ${VERIFICATION_COLUMNS} FROM email_verifications WHERE token_hash = ? LIMIT 1 FOR UPDATE`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

/** Non-locking read, for resend where no attempt counter is at stake. */
export async function findVerificationByToken(tokenHash, db = pool) {
  const [rows] = await db.execute(
    `SELECT ${VERIFICATION_COLUMNS} FROM email_verifications WHERE token_hash = ? LIMIT 1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function incrementVerificationAttempts(id, db = pool) {
  await db.execute('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?', [id]);
}

/** Rotates the code on resend: new secret, fresh expiry, attempt counter back to zero. */
export async function rotateVerificationCode({ id, codeHash, codeTtlSeconds }, db = pool) {
  await db.execute(
    `UPDATE email_verifications
     SET code_hash = ?, code_expires_at = NOW() + INTERVAL ? SECOND,
         attempts = 0, resend_count = resend_count + 1, last_sent_at = NOW()
     WHERE id = ?`,
    [codeHash, codeTtlSeconds, id],
  );
}

/** Marks the verification used and flips the user to verified. Caller supplies a transaction. */
export async function markVerified({ verificationId, userId }, db = pool) {
  await db.execute('UPDATE email_verifications SET consumed_at = NOW() WHERE id = ?', [verificationId]);
  await db.execute('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [userId]);
}

/**
 * The live verification for a user, if any. Serves the login-403 path, which knows the user but
 * not their pending token. Index: idx_ev_user_live (user_id, consumed_at).
 */
export async function findLiveVerificationByUser(userId, db = pool) {
  const [rows] = await db.execute(
    `SELECT ${VERIFICATION_COLUMNS} FROM email_verifications
     WHERE user_id = ? AND consumed_at IS NULL
     ORDER BY id DESC LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

/**
 * Swaps in a new pending token without touching the code or the attempt counter.
 *
 * Used when a user hits the login-403 path: they need a token to reach the verify screen, but
 * re-issuing the code here would let repeated logins reset the attempt counter at will.
 */
export async function replaceVerificationToken({ id, tokenHash, tokenTtlSeconds }, db = pool) {
  await db.execute(
    `UPDATE email_verifications
     SET token_hash = ?, token_expires_at = NOW() + INTERVAL ? SECOND
     WHERE id = ?`,
    [tokenHash, tokenTtlSeconds, id],
  );
}

/** Used by the login-403 path, which has the user but not their pending token. */
export async function findUserForVerification(userId, db = pool) {
  const [rows] = await db.execute(
    `SELECT ${USER_PUBLIC_COLUMNS}, email_verified_at FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}
