import { pool } from './pool.js';

/**
 * Runs `fn` inside a transaction, passing the connection as the `db` param
 * repositories expect. Commits on success, rolls back and rethrows on error.
 */
export async function withTransaction(fn) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}
