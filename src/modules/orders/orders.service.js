import * as ordersRepository from './orders.repository.js';
import { computePricing } from '../pricing/pricing.service.js';
import { storeFromDataUrl, isImageDataUrl } from '../assets/assets.service.js';
import { withTransaction } from '../../db/tx.js';
import { logger } from '../../utils/logger.js';

/**
 * Places an order.
 *
 * The client's `pricing` object is accepted by the schema and then DISCARDED. Every figure
 * persisted and returned is recomputed from kit_prices and delivery_methods. Open DevTools, edit
 * `total` to 1, submit — and you are still charged the real price (CLAUDE.md rule 2,
 * docs/backend-plan.md §1.1).
 */
export async function placeOrder({ body, userId = null, idempotencyKey = null, ip = null }) {
  // A repeat of a request we already completed. Return the original rather than making a second
  // order — checked before any work so a double-click costs nothing.
  if (idempotencyKey) {
    const existing = await ordersRepository.findByIdempotencyKey(idempotencyKey);
    if (existing) return { order: toOrderResponse(existing), replayed: true };
  }

  // ── Pricing: server-computed, client-ignored ────────────────────────────────
  const pricing = await computePricing({
    kitType: body.design.kitType,
    template: body.design.template,
    sport: body.design.sport,
    totalKits: body.totalKits,
    deliveryId: body.deliveryId,
  });

  // The one thing the client's pricing object is used for. This single line is both the fraud
  // signal (someone edited the total) and the staleness signal (a price changed while their page
  // was open) — two different problems, same detection. Warn, never reject: rejecting would
  // break checkout for the honest stale-page case, and the contract has no conflict handler.
  const clientTotal = body.pricing?.total;
  if (clientTotal != null && clientTotal !== pricing.total) {
    logger.warn({
      event: 'price_mismatch',
      clientTotal,
      serverTotal: pricing.total,
      kitType: body.design.kitType,
      totalKits: body.totalKits,
      deliveryId: body.deliveryId,
      ip,
    }, 'client pricing did not match server pricing');
  }

  // ── Logo: never stored as base64 ───────────────────────────────────────────
  // Done before the transaction: the pipeline decodes, sniffs, re-encodes through sharp and
  // writes a file, which is far too slow to hold one of ten pool connections open for.
  const design = { ...body.design };
  if (isImageDataUrl(design.logoDataUrl)) {
    const asset = await storeFromDataUrl(design.logoDataUrl, { ownerUserId: userId });
    design.logoDataUrl = asset.url; // now '/static/logos/<uuid>.webp'
  }

  try {
    const order = await withTransaction(async (db) => {
      const id = await ordersRepository.insertOrder({
        userId,
        design,
        contact: body.contact,
        address: body.address,
        deliveryId: body.deliveryId,
        paymentId: body.paymentId,
        totalKits: body.totalKits,
        primarySize: body.primarySize,
        instructions: body.instructions,
        pricing,
        idempotencyKey,
      }, db);

      const reference = ordersRepository.buildReference(id);
      await ordersRepository.setReference(id, reference, db);
      return { id, reference };
    });

    return {
      order: {
        id: order.id,
        reference: order.reference,
        pricing,
        status: 'placed',
      },
      replayed: false,
    };
  } catch (err) {
    // Two requests with the same key raced past the pre-check. The unique index on
    // idempotency_key is the real guard; this turns the collision into the original order.
    if (err.errno === 1062 && idempotencyKey) {
      const existing = await ordersRepository.findByIdempotencyKey(idempotencyKey);
      if (existing) return { order: toOrderResponse(existing), replayed: true };
    }
    throw err;
  }
}

/** Rebuilds the contract response from a stored row, for the idempotent-replay path. */
function toOrderResponse(row) {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    pricing: {
      unitPrice: row.unit_price,
      kitPrice: row.kit_price,
      deliveryPrice: row.delivery_price,
      discount: row.discount,
      total: row.total_price,
    },
  };
}
