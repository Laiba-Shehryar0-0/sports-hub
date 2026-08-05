import * as pricingRepository from './pricing.repository.js';
import { AppError } from '../../utils/AppError.js';
import {
  TEMPLATE_NAMES, SPORT_LABELS, MIN_TOTAL_KITS, MAX_TOTAL_KITS,
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
