import * as ordersRepository from './orders.repository.js';
import { computeCartPricing, listDeliveryOptions } from '../pricing/pricing.service.js';
import { TEMPLATE_NAMES, SPORT_LABELS, MIN_TOTAL_KITS } from '../pricing/pricing.constants.js';
import { storeFromDataUrl, isImageDataUrl, assetExists } from '../assets/assets.service.js';
import { withTransaction } from '../../db/tx.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/AppError.js';

/**
 * Places an order.
 *
 * The client's `pricing` object is accepted by the schema and then DISCARDED. Every figure
 * persisted and returned is recomputed from kit_prices and delivery_methods. Open DevTools, edit
 * `total` to 1, submit — and you are still charged the real price (CLAUDE.md rule 2,
 * docs/backend-plan.md §1.1).
 */
export async function placeOrder({ body, userId = null, idempotencyKey = null, ip = null }) {
  // `body` is always the CART shape by the time it gets here: orders.schema normalises a legacy
  // single-design payload into a one-item cart and marks it `legacyShape`. That flag is derived by
  // the parser and is not accepted from the request; all it decides is whether the nullable
  // singular columns are written. There is one code path below, not two.
  const isLegacy = body.legacyShape === true;

  // A repeat of a request we already completed. Return the original rather than making a second
  // order — checked before any work so a double-click costs nothing.
  if (idempotencyKey) {
    const existing = await ordersRepository.findByIdempotencyKey(idempotencyKey);
    if (existing) return { order: await toOrderResponse(existing, isLegacy), replayed: true };
  }

  // ── Pricing: server-computed, client-ignored ────────────────────────────────
  // computeCartPricing for BOTH shapes. Two pricing routes over one normalised shape would drift;
  // the 72-case characterization matrix in pricing.test.js proves a one-item cart agrees with the
  // old computePricing on every figure, which is what makes this safe.
  const pricing = await computeCartPricing({
    items: body.items.map((item) => ({
      kitType: item.design.kitType,
      template: item.design.template,
      sport: item.design.sport,
      size: item.size,
      quantity: item.quantity,
    })),
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
      // Never the full body (rule 14) — the shape of the cart is enough to investigate with.
      itemCount: body.items.length,
      kitTypes: body.items.map((item) => item.design.kitType),
      totalKits: pricing.totalKits,
      deliveryId: body.deliveryId,
      ip,
    }, 'client pricing did not match server pricing');
  }

  // ── Logos: never stored as base64, and all resolved BEFORE the transaction ─────────────────
  // Each is a sharp decode/re-encode plus a file write, or (since Phase 2.5, the common case) a
  // cheap existence stat on an already-uploaded URL. Either way it is far too slow to hold one of
  // ten pool connections open for, so none of it happens inside withTransaction.
  //
  // Concurrent rather than sequential: post-2.5 most lines carry a URL, so this is usually N
  // stats, and MAX_CART_ITEMS bounds N at 20.
  const designs = await Promise.all(body.items.map((item) => resolveLogo(item.design, userId)));

  // Lines to persist: server-computed money from `pricing`, design from the resolved copy. The
  // client's own figures reach neither.
  const lines = pricing.items.map((line, index) => ({
    position: line.position,
    design: designs[index],
    kitType: line.kitType,
    kitProduct: designs[index].kitProduct ?? null,
    size: line.size,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
  }));

  try {
    const order = await withTransaction(async (db) => {
      const id = await ordersRepository.insertOrder({
        userId,
        // The singular columns, nullable since 007, are written ONLY for a legacy body. A
        // multi-line cart has no single design, size or unit price, and inventing one would be
        // worse than a NULL. Phase 5 drops these columns and this branch together.
        design: isLegacy ? designs[0] : null,
        primarySize: isLegacy ? body.items[0].size : null,
        contact: body.contact,
        address: body.address,
        deliveryId: body.deliveryId,
        paymentId: body.paymentId,
        totalKits: pricing.totalKits,
        instructions: body.instructions,
        pricing: {
          unitPrice: isLegacy ? pricing.items[0].unitPrice : null,
          kitPrice: pricing.kitPrice,
          deliveryPrice: pricing.deliveryPrice,
          discount: pricing.discount,
          total: pricing.total,
        },
        idempotencyKey,
      }, db);

      await ordersRepository.insertOrderItems(id, lines, db);

      const reference = ordersRepository.buildReference(id);
      await ordersRepository.setReference(id, reference, db);
      return { id, reference };
    });

    return {
      order: {
        id: order.id,
        reference: order.reference,
        pricing: isLegacy ? toLegacyPricing(pricing) : pricing,
        status: 'placed',
      },
      replayed: false,
    };
  } catch (err) {
    // Two requests with the same key raced past the pre-check. The unique index on
    // idempotency_key is the real guard; this turns the collision into the original order.
    //
    // insertOrder is the FIRST statement in the transaction, so a duplicate key aborts before
    // insertOrderItems runs — and even if that order changed, withTransaction rolls back, so no
    // line can survive a failed header. Belt and braces; the test asserts the observable
    // consequence (COUNT(*) unchanged) rather than either mechanism.
    if (err.errno === 1062 && idempotencyKey) {
      const existing = await ordersRepository.findByIdempotencyKey(idempotencyKey);
      if (existing) return { order: await toOrderResponse(existing, isLegacy), replayed: true };
    }
    throw err;
  }
}

/**
 * Prices a cart in progress. CREATES NOTHING — no order, no lines, no files.
 *
 * Exists because the cart page must not compute prices itself (rule 2), and because a cart can sit
 * in localStorage for weeks: a kit type can be retired and an uploaded logo can be swept away
 * while a line still references it. Both surface HERE, on the cart page, with the offending lines
 * named — never as a 422 at the moment of payment.
 */
export async function quoteCart({ items, deliveryId }) {
  // ── Logos first, so BOTH classes of problem can be reported together ───────────────────────
  // Pricing throws on an unknown kit type, which would end the request before any logo was
  // checked. Checking logos first means a cart with both faults names both, instead of the user
  // fixing one, re-quoting, and discovering the other.
  //
  // A data URL is skipped: it is the offline fallback, has no stored file to find, and is
  // converted server-side at order time.
  const missingLogoPositions = [];
  await Promise.all(items.map(async (item, index) => {
    const url = item.design.logoDataUrl;
    if (url === null || isImageDataUrl(url)) return;
    if (!await assetExists(url)) missingLogoPositions.push(index + 1);
  }));
  missingLogoPositions.sort((a, b) => a - b);   // Promise.all resolves out of order

  let pricing = null;
  let unavailableKitTypes = [];

  try {
    pricing = await computeCartPricing({
      items: items.map((item) => ({
        kitType: item.design.kitType,
        template: item.design.template,
        sport: item.design.sport,
        size: item.size,
        quantity: item.quantity,
      })),
      deliveryId,
      // The floor is order eligibility, not a pricing rule. A 3-kit cart still gets prices so the
      // page can show a running total; POST /orders enforces the minimum for real.
      enforceMinimum: false,
    });
  } catch (err) {
    // ONLY the retired-kit case is absorbed into the combined report. Everything else rethrows.
    //
    // A bare catch here would swallow PRICING_EMPTY_CART, PRICING_INVALID_QUANTITY,
    // PRICING_TOO_MANY_ITEMS and PRICING_UNKNOWN_DELIVERY into a generic "unavailable" response —
    // the right status with a message that names the wrong problem, which is the same failure
    // class as "Validation failed." There is a test asserting a bad deliveryId still surfaces as
    // PRICING_UNKNOWN_DELIVERY.
    if (err.code !== 'PRICING_UNKNOWN_KIT_TYPE') throw err;
    unavailableKitTypes = err.details?.kitTypes ?? [];
  }

  if (unavailableKitTypes.length > 0 || missingLogoPositions.length > 0) {
    throw new AppError('Some items in your cart are no longer available.', {
      statusCode: 422,
      code: 'QUOTE_UNAVAILABLE',
      details: { unavailableKitTypes, missingLogoPositions },
    });
  }

  /**
   * The delivery options with their prices, so the checkout selector can show all four without a
   * hardcoded table of its own. A quote prices only the SELECTED method, and the selector exists
   * to compare — so without this the frontend needs its own copy, which is exactly the second
   * price table BASE_PRICES was deleted to remove.
   *
   * Fetched after pricing rather than in the Promise.all above: a cart that cannot be priced
   * should not pay for this query, and an unavailable-items 422 returns before reaching here.
   */
  const deliveryOptions = await listDeliveryOptions();

  return {
    ...pricing,
    deliveryOptions,
    // Server-supplied so the cart page renders "add N more" from this, never from a hardcoded 5.
    // MIN_TOTAL_KITS lives in one place and that place is not the frontend.
    belowMinimum: pricing.totalKits < MIN_TOTAL_KITS,
    minimumKits: MIN_TOTAL_KITS,
  };
}

/**
 * Resolves one design's logo to a stored URL. Returns a COPY — the request body is never mutated.
 *
 * Since Phase 2 the field may already be a '/static/logos/<uuid>.webp' URL uploaded via
 * POST /api/assets. isImageDataUrl is false for those, so they pass straight through:
 * re-processing one would fetch our own file back and write a second copy under a new UUID,
 * orphaning the first.
 */
async function resolveLogo(design, userId) {
  const resolved = { ...design };

  if (isImageDataUrl(resolved.logoDataUrl)) {
    const asset = await storeFromDataUrl(resolved.logoDataUrl, { ownerUserId: userId });
    resolved.logoDataUrl = asset.url; // now '/static/logos/<uuid>.webp'
  } else if (resolved.logoDataUrl !== null && !await assetExists(resolved.logoDataUrl)) {
    // The schema proved the URL is SHAPED like one this server minted; it cannot prove the file
    // exists. Without this, any caller could store a reference to a UUID that was never uploaded
    // and the order would render a broken image with nothing recording why.
    //
    // This is not an ownership check — a caller who already holds a valid URL may reference it.
    // Ownership needs the uploads table in docs/known-gaps.md. A v4 UUID is 122 bits of CSPRNG
    // entropy, so it cannot be guessed, and /static/logos is public anyway.
    throw new AppError('That logo is no longer available. Please upload it again.', {
      statusCode: 422,
      code: 'ASSET_NOT_FOUND',
    });
  }

  return resolved;
}

/**
 * Projects cart pricing back into the flat single-design shape the legacy contract returns.
 *
 * Field-for-field identical to what computePricing used to return — that equivalence is asserted
 * by the characterization matrix, not assumed here.
 */
function toLegacyPricing(pricing) {
  const [line] = pricing.items;
  return {
    unitPrice: line.unitPrice,
    kitLabel: line.kitLabel,
    templateName: line.templateName,
    sportLabel: line.sportLabel,
    kitPrice: pricing.kitPrice,
    deliveryName: pricing.deliveryName,
    deliveryPrice: pricing.deliveryPrice,
    discount: pricing.discount,
    total: pricing.total,
  };
}

/**
 * Rebuilds the contract response from stored rows, for the idempotent-replay path.
 *
 * The shape mirrors the REQUEST, which is sound because a replay is by definition the same request
 * retried: a legacy retry wants the flat shape, a cart retry wants lines.
 *
 * Every figure comes from the persisted columns, never from a recompute. A price could have
 * changed between the original order and the retry, and the reply must state what was actually
 * charged.
 */
async function toOrderResponse(row, isLegacy) {
  if (isLegacy) {
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

  const items = await ordersRepository.findItemsByOrderId(row.id);

  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    pricing: {
      // kitLabel and deliveryName are absent here: they are presentation strings derived from
      // kit_prices/delivery_methods and are not persisted per line, so reproducing them would mean
      // re-querying tables whose contents may have changed since the order. If parity ever
      // matters, persist them on order_items — do not re-derive them.
      items: items.map((item) => ({
        position: item.position,
        kitType: item.kit_type,
        kitProduct: item.kit_product,
        // mysql2 parses JSON columns already — never JSON.parse them.
        templateName: TEMPLATE_NAMES[item.design_json.template] ?? item.design_json.template,
        sportLabel: SPORT_LABELS[item.design_json.sport] ?? item.design_json.sport,
        size: item.size,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        lineTotal: item.line_total,
      })),
      totalKits: row.total_kits,
      kitPrice: row.kit_price,
      deliveryPrice: row.delivery_price,
      discount: row.discount,
      total: row.total_price,
    },
  };
}
