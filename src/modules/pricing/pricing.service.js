import * as pricingRepository from './pricing.repository.js';
import { AppError } from '../../utils/AppError.js';
import {
  TEMPLATE_NAMES, SPORT_LABELS, MIN_TOTAL_KITS, MAX_TOTAL_KITS, MAX_CART_ITEMS,
} from './pricing.constants.js';

/**
 * Server-side price computation. This is the only place order money is decided.
 *
 * Every figure comes from kit_prices and delivery_methods. Nothing the client sends about price
 * is read, ever — see CLAUDE.md rule 2 and docs/backend-plan.md §1.1. The caller passes only
 * *what was ordered*; what it costs is not the client's to state.
 *
 * All arithmetic is integer PKR. The inputs are INT UNSIGNED columns and the only operations are
 * multiply and add, so no rounding is required anywhere while discount is 0.
 */

/**
 * Guards against a non-integer or overflowed figure reaching the database or the response.
 * Worst case today is 3200 * 500 + 3500 = 1,603,500 — comfortably inside both INT UNSIGNED and
 * Number.MAX_SAFE_INTEGER — but a future price column change or a stray float should fail loudly
 * rather than silently persist a wrong total.
 */
function assertWholePkr(label, value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AppError('Could not price this order.', {
      statusCode: 500,
      code: 'PRICING_NOT_INTEGER',
      details: { field: label },
    });
  }
  return value;
}

export async function computePricing({ kitType, template, sport, totalKits, deliveryId }) {
  // Bounds are enforced here as well as at the route's zod schema: this function is the last
  // thing between an order and a persisted money column, and it is callable directly.
  if (!Number.isInteger(totalKits) || totalKits < MIN_TOTAL_KITS || totalKits > MAX_TOTAL_KITS) {
    throw new AppError(
      `Order quantity must be a whole number between ${MIN_TOTAL_KITS} and ${MAX_TOTAL_KITS}.`,
      { statusCode: 422, code: 'PRICING_INVALID_QUANTITY', details: { totalKits } },
    );
  }

  const [kit, delivery] = await Promise.all([
    pricingRepository.findKitPrice(kitType),
    pricingRepository.findDeliveryMethod(deliveryId),
  ]);

  // Deliberately NOT the frontend's `BASE_PRICES[kitType] ?? 2800` / `?? DELIVERY_METHODS[0]`
  // fallbacks. Silently pricing an unknown kitType as a jersey, or an unknown deliveryId as free
  // standard shipping, is exactly how a tampered payload gets underpriced.
  if (!kit) {
    throw new AppError('That kit type is not available.', {
      statusCode: 422, code: 'PRICING_UNKNOWN_KIT_TYPE', details: { kitType },
    });
  }
  if (!delivery) {
    throw new AppError('That delivery method is not available.', {
      statusCode: 422, code: 'PRICING_UNKNOWN_DELIVERY', details: { deliveryId },
    });
  }

  const unitPrice = assertWholePkr('unitPrice', kit.unit_price);
  const deliveryPrice = assertWholePkr('deliveryPrice', delivery.price);

  // Flat linear — no quantity tiers or bulk breakpoints exist in the source pricing
  // (docs/EXTRACTED.md §1).
  const kitPrice = assertWholePkr('kitPrice', unitPrice * totalKits);

  // Always 0: promo codes are out of scope because the frontend never sends the code itself,
  // only the resulting discount fraction, and that arrives inside the `pricing` object the server
  // must discard. See docs/known-gaps.md and docs/backend-plan.md §8.
  const discount = 0;

  // Order of operations is load-bearing: the discount comes off kitPrice BEFORE delivery is
  // added, so delivery is never discounted. Indistinguishable while discount is 0, but writing it
  // the other way would bake in a bug for whenever promo codes land.
  const total = assertWholePkr('total', kitPrice - discount + deliveryPrice);

  return {
    unitPrice,
    kitLabel: kit.kit_label,
    templateName: TEMPLATE_NAMES[template] ?? template,
    sportLabel: SPORT_LABELS[sport] ?? sport,
    kitPrice,
    deliveryName: delivery.name,
    deliveryPrice,
    discount,
    total,
  };
}

/**
 * Prices a multi-line cart: per-item lines plus ONE cart-level delivery charge.
 *
 * Delivery is per-cart, not per-item — one address, one deliveryId, one parcel. Charging 500 four
 * times for one shipment would simply be wrong.
 *
 * computePricing() above is left untouched and still serves the single-design path. For a
 * one-item cart the two agree on unitPrice, kitPrice, deliveryPrice, discount and total; there is
 * a characterization test asserting exactly that against every kit type and delivery method.
 */
export async function computeCartPricing({ items, deliveryId }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('Your cart is empty.', {
      statusCode: 422, code: 'PRICING_EMPTY_CART',
    });
  }
  if (items.length > MAX_CART_ITEMS) {
    throw new AppError(`A cart can hold at most ${MAX_CART_ITEMS} designs.`, {
      statusCode: 422,
      code: 'PRICING_TOO_MANY_ITEMS',
      details: { received: items.length, max: MAX_CART_ITEMS },
    });
  }

  // Per-line quantity, checked before any database work so a malformed cart costs nothing.
  // MIN_TOTAL_KITS is deliberately NOT applied per line — it is a cart-wide minimum, so
  // 3 jerseys + 2 shorts is a valid 5-kit order.
  items.forEach((item, index) => {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new AppError('Every item needs a whole quantity of at least 1.', {
        statusCode: 422,
        code: 'PRICING_INVALID_QUANTITY',
        details: { position: index + 1, quantity: item.quantity },
      });
    }
  });

  const totalKits = items.reduce((sum, item) => sum + item.quantity, 0);
  if (totalKits < MIN_TOTAL_KITS || totalKits > MAX_TOTAL_KITS) {
    throw new AppError(
      `Order quantity must be between ${MIN_TOTAL_KITS} and ${MAX_TOTAL_KITS} kits in total.`,
      { statusCode: 422, code: 'PRICING_INVALID_QUANTITY', details: { totalKits } },
    );
  }

  const [priceMap, delivery] = await Promise.all([
    pricingRepository.findKitPricesByTypes(items.map((item) => item.kitType)),
    pricingRepository.findDeliveryMethod(deliveryId),
  ]);

  // MANDATORY MISS CHECK. findKitPricesByTypes returns only the types it found — an unknown or
  // deactivated type is simply ABSENT, with nothing in the result announcing the loss. Skipping
  // this would price a short cart and undercharge the order.
  //
  // Every miss is collected rather than throwing on the first, so the cart page can disable all
  // affected lines at once instead of surfacing them one reload at a time.
  const missing = [...new Set(
    items.map((item) => item.kitType).filter((kitType) => !priceMap.has(kitType)),
  )];
  if (missing.length > 0) {
    throw new AppError('Some items are no longer available.', {
      statusCode: 422, code: 'PRICING_UNKNOWN_KIT_TYPE', details: { kitTypes: missing },
    });
  }

  if (!delivery) {
    throw new AppError('That delivery method is not available.', {
      statusCode: 422, code: 'PRICING_UNKNOWN_DELIVERY', details: { deliveryId },
    });
  }

  const deliveryPrice = assertWholePkr('deliveryPrice', delivery.price);

  const lines = items.map((item, index) => {
    const kit = priceMap.get(item.kitType);
    const unitPrice = assertWholePkr('unitPrice', kit.unit_price);
    // Flat linear, no quantity tiers — same rule as the single-design path.
    const lineTotal = assertWholePkr('lineTotal', unitPrice * item.quantity);

    return {
      position: index + 1,            // 1-based, matching order_items.position
      kitType: item.kitType,
      kitLabel: kit.kit_label,
      templateName: TEMPLATE_NAMES[item.template] ?? item.template,
      sportLabel: SPORT_LABELS[item.sport] ?? item.sport,
      size: item.size,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
    };
  });

  // Named kitPrice, not itemsTotal: identical meaning to computePricing.kitPrice and maps 1:1 to
  // orders.kit_price, so nothing has to translate between the two paths.
  const kitPrice = assertWholePkr('kitPrice', lines.reduce((sum, line) => sum + line.lineTotal, 0));

  // Always 0 — promo codes are out of scope (docs/known-gaps.md, backend-plan §8).
  //
  // ROUNDING RULE, fixed now so it cannot be decided accidentally later: a percentage discount is
  // computed ONCE on kitPrice and rounded ONCE. It is never applied per line, because
  // Σ round(lineᵢ × pct) ≠ round(Σ lineᵢ × pct) — rounding per line and summing drifts from the
  // displayed subtotal by up to ~N/2 PKR across N lines. Rounding once keeps every lineTotal
  // exact and the cart total authoritative. If per-line attribution is ever needed for refunds,
  // DERIVE it from this single figure by largest-remainder; never recompute it per line, or the
  // parts will not sum to the whole.
  const discount = 0;

  // Discount comes off kitPrice BEFORE delivery is added — delivery is never discounted.
  const total = assertWholePkr('total', kitPrice - discount + deliveryPrice);

  return {
    items: lines,
    totalKits,
    kitPrice,
    deliveryName: delivery.name,
    deliveryPrice,
    discount,
    total,
  };
}
