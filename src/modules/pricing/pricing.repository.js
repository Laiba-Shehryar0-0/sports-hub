import { pool } from '../../db/pool.js';

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

/** Index: PRIMARY (id) — delivery_methods keys on the natural id ('standard', 'express', ...). */
export async function findDeliveryMethod(deliveryId, db = pool) {
  const [rows] = await db.execute(
    `SELECT ${DELIVERY_COLUMNS} FROM delivery_methods WHERE id = ? AND is_active = 1 LIMIT 1`,
    [deliveryId],
  );
  return rows[0] ?? null;
}
