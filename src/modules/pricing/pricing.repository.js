import { pool } from '../../db/pool.js';
import { MAX_CART_ITEMS } from './pricing.constants.js';
import { AppError } from '../../utils/AppError.js';

/**
 * The only two tables pricing is allowed to read. Every figure the service returns is derived
 * from these rows — never from anything the client sent (CLAUDE.md rule 2).
 */

const KIT_PRICE_COLUMNS = 'kit_type, kit_label, unit_price';
const DELIVERY_COLUMNS = 'id, name, price';

/**
 * Index: uq_kit_price (kit_type) — unique, const access, one dive.
 *
 * is_active = 1 is in the WHERE clause so a retired price is unpriceable rather than quietly
 * still sellable. A missing row and a deactivated row are deliberately indistinguishable here;
 * the service turns both into the same error.
 */
export async function findKitPrice(kitType, db = pool) {
  const [rows] = await db.execute(
    `SELECT ${KIT_PRICE_COLUMNS} FROM kit_prices WHERE kit_type = ? AND is_active = 1 LIMIT 1`,
    [kitType],
  );
  return rows[0] ?? null;
}

/**
 * Batched sibling of findKitPrice, for pricing a multi-line cart in ONE round trip.
 * A `for` loop of `await findKitPrice()` over cart lines would violate CLAUDE.md rule 13.
 *
 * ┌─ THE CALLER MUST CHECK FOR MISSES ────────────────────────────────────────────────────────┐
 * │ Returns AT MOST one entry per requested type. `IN (?)` returns only the rows that matched, │
 * │ and a type with no active row is simply ABSENT from the Map — there is nothing in the      │
 * │ result announcing it was dropped. Pricing a cart without checking every line against this  │
 * │ Map would silently omit a line and undercharge the order.                                  │
 * │                                                                                            │
 * │ The caller looks up each item and throws on the first miss. Kept here rather than throwing │
 * │ inside the repository so the layering matches the rest of the module: repositories return  │
 * │ data, services own the HTTP meaning (createUser returns null on 1062; the service raises   │
 * │ the 409).                                                                                  │
 * └───────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A deactivated type and a nonexistent one are deliberately indistinguishable, exactly as in
 * findKitPrice.
 *
 * Index: uq_kit_price (kit_type) — unique, so this is a short list of const lookups, not a scan.
 *
 * @returns {Promise<Map<string, {kit_type: string, kit_label: string, unit_price: number}>>}
 */
export async function findKitPricesByTypes(kitTypes, db = pool) {
  // Deduplicate BEFORE the query. A 20-line cart of jerseys must not send 'jersey' twenty times;
  // there are only six kit types in existence, so the deduped list is tiny in practice.
  const unique = [...new Set(kitTypes)];

  // `IN ()` with an empty list is a MySQL syntax error, and mysql2's array expansion will not
  // save us. Nothing to look up, so nothing to ask.
  if (unique.length === 0) return new Map();

  // Bound AFTER dedup, so a legitimate cart is judged on distinct types rather than line count.
  // There cannot be more distinct types than lines, so MAX_CART_ITEMS is the natural ceiling —
  // and it means a hostile caller cannot push an unbounded list into the IN clause. Assume the
  // list is hostile: this function is one call away from request data.
  if (unique.length > MAX_CART_ITEMS) {
    throw new AppError('Too many items to price.', {
      statusCode: 422,
      code: 'PRICING_TOO_MANY_TYPES',
      details: { received: unique.length, max: MAX_CART_ITEMS },
    });
  }

  // query(), not execute(): mysql2 only expands an array into an `IN (?)` list for query().
  // execute() uses a prepared statement, where `?` is a single scalar placeholder and the array
  // would bind as one value. Still a placeholder — the values are never interpolated into SQL.
  const [rows] = await db.query(
    `SELECT ${KIT_PRICE_COLUMNS} FROM kit_prices WHERE kit_type IN (?) AND is_active = 1`,
    [unique],
  );

  return new Map(rows.map((row) => [row.kit_type, row]));
}

/** Index: PRIMARY (id) — delivery_methods keys on the natural id ('standard', 'express', ...). */
export async function findDeliveryMethod(deliveryId, db = pool) {
  const [rows] = await db.execute(
    `SELECT ${DELIVERY_COLUMNS} FROM delivery_methods WHERE id = ? AND is_active = 1 LIMIT 1`,
    [deliveryId],
  );
  return rows[0] ?? null;
}
