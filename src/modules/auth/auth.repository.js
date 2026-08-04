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
  const [rows] = await db.execute(
    `SELECT ${USER_PUBLIC_COLUMNS}, password_hash FROM users WHERE email = ? AND is_active = 1 LIMIT 1`,
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
  return { id: row.id, name: row.name, email: row.email, role: row.role };
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
