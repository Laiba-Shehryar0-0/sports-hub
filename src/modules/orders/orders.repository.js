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
      JSON.stringify(order.design),
      JSON.stringify(order.contact),
      JSON.stringify(order.address),
      order.deliveryId,
      order.paymentId,
      order.totalKits,
      order.primarySize,
      order.instructions || null,
      order.pricing.unitPrice,
      order.pricing.kitPrice,
      order.pricing.deliveryPrice,
      order.pricing.discount,
      order.pricing.total,
      order.idempotencyKey ?? null,
    ],
  );
  return result.insertId;
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
