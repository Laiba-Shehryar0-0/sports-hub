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
 * `findByReference` was deleted in Phase 5 (2026-08-13). It had no callers — it was written in
 * anticipation of GET /orders/:reference, which is still not in scope — and it selected two
 * columns migration 008 dropped, so keeping it meant maintaining dead SQL. When order history
 * lands it wants writing against the schema of that day, including the ownership WHERE clause
 * (CLAUDE.md rule 6) that this one already had: `WHERE reference = ? AND user_id = ?`, 404 not
 * 403 when it is not the caller's.
 */
