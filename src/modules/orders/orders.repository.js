import { pool } from '../../db/pool.js';

/**
 * Columns are listed explicitly everywhere. Never SELECT * on orders — it carries three JSON
 * blobs, and design_json in particular has no business travelling to a list endpoint.
 */
const ORDER_SUMMARY_COLUMNS = `id, reference, status, unit_price, kit_price, delivery_price,
  discount, total_price, delivery_id, payment_id, total_kits, primary_size`;

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
       (reference, user_id, design_json, contact_json, address_json, delivery_id, payment_id,
        total_kits, primary_size, instructions,
        unit_price, kit_price, delivery_price, discount, total_price, idempotency_key)
     VALUES ('', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      order.userId,
      // Nullable since migration 007. `? :` rather than JSON.stringify(null), which yields the
      // STRING "null" and would store a JSON null instead of a SQL NULL — the two are different
      // and only the second is what `WHERE design_json IS NULL` finds.
      order.design ? JSON.stringify(order.design) : null,
      JSON.stringify(order.contact),
      JSON.stringify(order.address),
      order.deliveryId,
      order.paymentId,
      // NOT NULL, and meaningful for both shapes: the summed quantity across every line.
      order.totalKits,
      // Nullable since 007: a multi-line cart has no single size or unit price. Populated only
      // for a legacy body, so the existing order tests keep asserting what they assert today.
      order.primarySize ?? null,
      order.instructions || null,
      order.pricing.unitPrice ?? null,
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
 * it. This is a single-order read, not a list endpoint, so carrying the JSON is proportionate —
 * unlike on orders, where design_json must never travel to a list.
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

/** Index: uq_order_ref (reference). Ownership is applied by the caller via the WHERE clause. */
export async function findByReference(reference, userId = null, db = pool) {
  // Ownership goes in the WHERE clause, never a fetch-then-check in JS (CLAUDE.md rule 6).
  // A guest order (user_id NULL) is only reachable without a user context.
  const [rows] = userId === null
    ? await db.execute(
      `SELECT ${ORDER_SUMMARY_COLUMNS} FROM orders WHERE reference = ? AND user_id IS NULL LIMIT 1`,
      [reference],
    )
    : await db.execute(
      `SELECT ${ORDER_SUMMARY_COLUMNS} FROM orders WHERE reference = ? AND user_id = ? LIMIT 1`,
      [reference, userId],
    );
  return rows[0] ?? null;
}
