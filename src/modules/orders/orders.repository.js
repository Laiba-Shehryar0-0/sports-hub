import { pool } from '../../db/pool.js';

/**
 * Columns are listed explicitly everywhere. Never SELECT * on orders — it carries two JSON blobs,
 * and neither contact_json nor address_json has any business travelling to a list endpoint.
 *
 * `unit_price` and `primary_size` were removed from this list in Phase 5, with the columns
 * themselves (migration 008). Selecting a dropped column is an ER_BAD_FIELD_ERROR on every read,
 * so this string and that migration had to move together.
 */
const ORDER_SUMMARY_COLUMNS = `id, reference, status, kit_price, delivery_price,
  discount, total_price, delivery_id, payment_id, total_kits`;

/**
 * Inserts the order. `reference` is derived from the auto-increment id, which does not exist
 * until after the insert, so it is written in a second statement inside the same transaction —
 * the row is never visible without it.
 *
 * JSON columns are stringified on the way in: passing an object to mysql2 stores the literal
 * "[object Object]" (CLAUDE.md §Database).
 */
export async function insertOrder(order, db = pool) {
  const [result] = await db.execute(
    `INSERT INTO orders
       (reference, user_id, contact_json, address_json, delivery_id, payment_id,
        total_kits, instructions,
        kit_price, delivery_price, discount, total_price, idempotency_key)
     VALUES ('', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      order.userId,
      JSON.stringify(order.contact),
      JSON.stringify(order.address),
      order.deliveryId,
      order.paymentId,
      // The summed quantity across every line — the cart-level aggregate, which stays NOT NULL.
      // The per-design figures live on order_items, one row per line, since migration 007.
      order.totalKits,
      order.instructions || null,
      order.pricing.kitPrice,
      order.pricing.deliveryPrice,
      order.pricing.discount,
      order.pricing.total,
      order.idempotencyKey ?? null,
    ],
  );
  return result.insertId;
}

/**
 * Writes every line of an order in ONE statement.
 *
 * A loop of single-row inserts would be an `await` per row (CLAUDE.md rule 13) — 20 round trips
 * inside a transaction, holding a pool connection for the duration of all of them.
 *
 * Called only from inside withTransaction, immediately after insertOrder, so the header and its
 * lines commit together or not at all. An order with no lines is not a state this system should
 * ever be able to observe.
 */
export async function insertOrderItems(orderId, items, db = pool) {
  // `VALUES ()` is a syntax error. A validated cart cannot be empty, so this is a guard against a
  // programming mistake rather than an expected input.
  if (items.length === 0) return;

  const rows = items.map((item) => [
    orderId,
    item.position,
    JSON.stringify(item.design),   // object -> "[object Object]" without this
    item.kitType,
    item.kitProduct ?? null,
    item.size,
    item.quantity,
    item.unitPrice,
    item.lineTotal,
  ]);

  // query(), not execute(): mysql2 expands a nested array into a multi-row VALUES list only for
  // query(). execute() prepares the statement, where `?` is a single scalar placeholder and the
  // array would bind as one value — the same distinction as `IN (?)` in pricing.repository.
  // Still a placeholder: no value is ever interpolated into the SQL string.
  await db.query(
    `INSERT INTO order_items
       (order_id, position, design_json, kit_type, kit_product, size, quantity, unit_price, line_total)
     VALUES ?`,
    [rows],
  );
}

/**
 * The lines of one order, for the idempotent-replay response.
 *
 * Index: uq_order_items_position (order_id, position) — order_id is the leading column and
 * position the second, so this one index serves both the filter and the ordering. No filesort.
 *
 * design_json is selected because the replay rebuilds the per-line template and sport labels from
 * it. This is a single-order read, not a list endpoint, so carrying the JSON is proportionate; a
 * future list endpoint must not copy this SELECT.
 */
export async function findItemsByOrderId(orderId, db = pool) {
  const [rows] = await db.execute(
    `SELECT position, design_json, kit_type, kit_product, size, quantity, unit_price, line_total
     FROM order_items
     WHERE order_id = ?
     ORDER BY position`,
    [orderId],
  );
  return rows;
}

/** KW-2026-000044 — year of creation plus a zero-padded id, stable and human-quotable. */
export function buildReference(id, createdYear = new Date().getFullYear()) {
  return `KW-${createdYear}-${String(id).padStart(6, '0')}`;
}

export async function setReference(id, reference, db = pool) {
  await db.execute('UPDATE orders SET reference = ? WHERE id = ?', [reference, id]);
}

/**
 * Serves the double-submit path: after ER_DUP_ENTRY on uq_order_idem, return the order that
 * already exists rather than a second one. Index: uq_order_idem (idempotency_key).
 */
export async function findByIdempotencyKey(key, db = pool) {
  const [rows] = await db.execute(
    `SELECT ${ORDER_SUMMARY_COLUMNS} FROM orders WHERE idempotency_key = ? LIMIT 1`,
    [key],
  );
  return rows[0] ?? null;
}

/**
 * Serves GET /orders/:reference. Ownership is IN the WHERE clause (CLAUDE.md rule 6) — a
 * reference belonging to someone else returns no row, and the service turns that into 404, never
 * 403, so a caller cannot tell "not yours" apart from "doesn't exist." Index: uq_order_ref
 * (reference) narrows to at most one row before user_id is even checked.
 *
 * (This replaces the original `findByReference`, deleted in Phase 5 (2026-08-13) as dead code
 * written in anticipation of this endpoint before it existed. Same WHERE shape as planned then.)
 */
export async function findByReferenceAndUser(reference, userId, db = pool) {
  const [rows] = await db.execute(
    `SELECT ${ORDER_SUMMARY_COLUMNS}, created_at FROM orders WHERE reference = ? AND user_id = ? LIMIT 1`,
    [reference, userId],
  );
  return rows[0] ?? null;
}

/**
 * Serves GET /orders (mine) — one page of the caller's own orders, newest first.
 * Index: idx_order_user (user_id, created_at) — leading column is the WHERE, trailing column
 * satisfies ORDER BY ... DESC scanned backwards. No filesort.
 *
 * `limit`/`offset` are inlined, not `?`-bound (CLAUDE.md rule 1: "LIMIT/OFFSET only after zod
 * bounds them to integers"). mysql2's execute() (server-side prepared statements) has a long
 * history of rejecting LIMIT/OFFSET as bound parameters depending on version — inlining sidesteps
 * that entirely rather than depending on being on a version where it happens to work. Safe here
 * ONLY because both values already passed through listOrdersQuerySchema's z.coerce.number().int()
 * bounds before reaching this function — never raw request input.
 */
export async function findOrdersByUser(userId, { limit, offset }, db = pool) {
  // Not the validation itself — the schema is — but a wiring mistake that skipped it must not
  // become a SQL string built from an arbitrary value, so this fails loudly instead.
  if (!Number.isInteger(limit) || !Number.isInteger(offset)) {
    throw new Error('findOrdersByUser requires integer limit/offset.');
  }

  const [rows] = await db.execute(
    `SELECT ${ORDER_SUMMARY_COLUMNS}, created_at FROM orders
     WHERE user_id = ? ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    [userId],
  );
  return rows;
}

/** The caller's total order count, for the list endpoint's pagination metadata. Same index as
 *  findOrdersByUser — user_id is the leading column, so this is an index-only count. */
export async function countOrdersByUser(userId, db = pool) {
  const [[row]] = await db.execute(
    'SELECT COUNT(*) AS n FROM orders WHERE user_id = ?',
    [userId],
  );
  return row.n;
}
