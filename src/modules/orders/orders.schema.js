import { z } from 'zod';
import { MIN_TOTAL_KITS, MAX_TOTAL_KITS, MAX_CART_ITEMS } from '../pricing/pricing.constants.js';
import {
  SHIPPING_COUNTRIES, DOMESTIC_COUNTRY, allowedDeliveryIds, isDeliveryAllowedForCountry,
} from './orders.constants.js';
import {
  MAX_DATA_URL_CHARS, DATA_URL_PREFIX_RE, STORED_LOGO_URL_RE,
} from '../assets/assets.constants.js';

/**
 * The full order payload, transcribed from docs/schemas-draft.md — which corrected
 * backend-plan.md §4 against the real frontend source.
 *
 * Every object is .strict(): unknown keys are rejected rather than ignored, so a client cannot
 * smuggle an extra column's worth of data past validation (CLAUDE.md rule 7).
 */

const HEX = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a #RRGGBB colour.');
const pct = z.number().int().min(0).max(100);

// The UI's nudge grid clamps to these, never the full 0-1 range (docs/EXTRACTED.md).
const position = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
}).strict();

const LAYER_IDS = ['number', 'name', 'logo', 'sleeves', 'body'];

/**
 * Optional contract fields arrive as EMPTY STRINGS, not undefined (CLAUDE.md rule 8).
 * `z.string().email()` fails on '', which is the single most common bug when wiring a real
 * backend to an existing form — hence the explicit empty-string branch rather than .optional().
 */
const optionalText = (max) => z.string().max(max).optional().default('');
const optionalEmail = z.union([z.literal(''), z.string().email().max(190)]).optional().default('');

const designSchema = z.object({
  kitType: z.enum(['jersey', 'polo', 'jumper', 'shorts', 'socks', 'cap']),
  // Plain string, not an enum against the 20 catalog labels — lets the catalog grow without a
  // backend redeploy. Never priced on; kitType is what costs money.
  kitProduct: z.string().max(80).nullable(),
  // 5 values since the 2026-08-03 widening — identical to the catalog sport enum.
  sport: z.enum(['football', 'basketball', 'cricket', 'training', 'others']),
  template: z.enum([
    'solid', 'striped', 'diagonal', 'two-tone', 'hoops', 'halves',
    'chevron', 'sash', 'fade', 'fade-left', 'dots', 'sleeves',
  ]),
  size: z.enum(['S', 'M', 'L', 'XL', 'Custom']),
  customSize: optionalText(40),
  customSizeUnit: z.enum(['in', 'cm']).optional().default('in'),

  bodyColor: HEX,
  sleeveColor: HEX,
  numberColor: HEX,
  collarColor: HEX,

  opacity: z.object({ body: pct, sleeves: pct, number: pct, collar: pct }).strict(),

  playerName: z.object({
    front: z.string().max(20).default(''),
    back: z.string().max(20).default(''),
  }).strict(),
  playerNumber: z.object({
    front: z.string().regex(/^\d{0,3}$/).default(''),
    back: z.string().regex(/^\d{0,3}$/).default(''),
  }).strict(),

  font: z.enum([
    'Bebas Neue', 'Impact', 'Georgia', 'Courier New', 'Oswald',
    'Anton', 'Montserrat', 'Teko', 'Russo One', 'Archivo Black',
  ]),
  nameSize: z.number().int().min(8).max(30),
  numberSize: z.number().int().min(20).max(80),

  textPosition: position,
  numberPosition: position,

  /**
   * Either an inline data URL or a logo already uploaded via POST /api/assets.
   *
   * Both branches exist during the cart migration and afterwards. The URL branch is what the
   * frontend sends once Phase 2.5 uploads at logo-selection; the data-URL branch stays for the
   * offline fallback, which still produces base64 because there is no server to upload to.
   *
   * The URL branch is matched EXACTLY (prefix + UUID + .webp), never by `startsWith`. This value
   * is persisted into design_json and later rendered as an <img src>, so a loose check would let
   * a client store a path of its own choosing — a traversal string, or an off-site URL turning
   * every order view into a tracking beacon. Only something this server minted can match.
   *
   * The data-URL branch is bounded here, but its prefix is a shape check, not a security control:
   * what actually proves the type is the magic-byte sniff in the assets service.
   */
  logoDataUrl: z.union([
    z.string().max(MAX_DATA_URL_CHARS).regex(DATA_URL_PREFIX_RE),
    z.string().regex(STORED_LOGO_URL_RE),
  ]).nullable().default(null),
  logoPreset: z.enum(['football', 'cricket', 'basketball']).nullable().default(null),
  logoScale: z.number().int().min(30).max(150),
  logoOpacity: pct,
  logoPosition: position,

  layers: z.object({
    body: z.boolean(), sleeves: z.boolean(), number: z.boolean(),
    name: z.boolean(), logo: z.boolean(),
  }).strict(),
  layerOrder: z.array(z.enum(LAYER_IDS)).length(5)
    .refine(arr => new Set(arr).size === 5, 'layerOrder must contain each layer exactly once'),
}).strict();

const SIZES = ['S', 'M', 'L', 'XL', 'Custom'];

/** One cart line: a design, the size ordered, and how many. */
const cartItemSchema = z.object({
  design: designSchema,
  // The authoritative ordered size. `design.size` is part of the design snapshot and is
  // deliberately NOT cross-checked against this — exactly as `primarySize` and `design.size`
  // already relate on the legacy path. Checking one shape and not the other is the inconsistency.
  size: z.enum(SIZES),
  // Per line, the floor is 1. The 5-kit minimum is CART-WIDE and is enforced in
  // computeCartPricing, so 3 jerseys + 2 shorts is a valid order.
  quantity: z.coerce.number().int().min(1).max(MAX_TOTAL_KITS),
}).strict();

/** Fields both payload shapes share. Extended, never merged, so each branch keeps its own strict(). */
const baseOrder = z.object({
  contact: z.object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    email: z.string().trim().toLowerCase().email().max(190),
    phone: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number.'),
    clubName: optionalText(120),
  }).strict(),
  address: z.object({
    street: z.string().trim().min(1).max(255),
    city: z.string().trim().min(1).max(100),
    province: optionalText(100),
    postalCode: optionalText(20),
    // A fixed list, not free text. This also RESOLVES docs/EXTRACTED.md discrepancy #2: country
    // could previously be submitted as '' because the old TextField had no required-validation.
    // A dropdown always has a value, so '' is no longer producible and no longer accepted.
    country: z.enum(SHIPPING_COUNTRIES),
  }).strict(),
  deliveryId: z.enum(['standard', 'express', 'rush', 'international']),
  paymentId: z.enum(['card', 'bank', 'cod']),
  instructions: optionalText(1000),

  // ACCEPTED, THEN DISCARDED. Never read, never stored, never returned (CLAUDE.md rule 2).
  // Deliberately permissive — spending validation effort on a field that goes straight in the bin
  // would be wasted, and rejecting a malformed one would break checkout for no security gain.
  // The service reads only `pricing.total`, and only to log a price_mismatch warning.
  pricing: z.any().optional(),
});

/**
 * Cross-field rule: the delivery method must match where the parcel is going.
 *
 * Enforced here, not only in the UI, because the UI constraint is bypassable by a crafted request
 * — and the failure mode is a free domestic courier rate on an international address, which is
 * unfulfillable and a direct revenue loss. Shared by both branches so they cannot drift.
 */
function deliveryMatchesCountry(order, ctx) {
  if (!isDeliveryAllowedForCountry(order.address.country, order.deliveryId)) {
    const allowed = allowedDeliveryIds(order.address.country);
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['deliveryId'],
      message: order.address.country === DOMESTIC_COUNTRY
        ? 'International shipping is only for addresses outside Pakistan.'
        : 'Orders shipping outside Pakistan must use International Shipping.',
      params: { allowed },
    });
  }
}

/** The multi-item shape the cart sends. */
const cartOrderSchema = baseOrder.extend({
  items: z.array(cartItemSchema)
    .min(1, 'Your cart is empty.')
    .max(MAX_CART_ITEMS, `A cart can hold at most ${MAX_CART_ITEMS} designs.`),
}).strict().superRefine(deliveryMatchesCountry);

/**
 * Turns the single-design payload into a one-item cart, so the service has ONE code path.
 *
 * `legacyShape` is derived HERE, by the parser, and is never accepted from the body — both
 * branches are .strict() and neither declares it, so a client sending `legacyShape: true` is
 * rejected as an unrecognized key. That matters: it decides whether the singular columns
 * (design_json, unit_price, primary_size) get written, and a client-controlled switch over which
 * columns a row gets is not something to leave reachable.
 */
function legacyToCart({ design, totalKits, primarySize, ...rest }) {
  return {
    ...rest,
    items: [{ design, size: primarySize, quantity: totalKits }],
    legacyShape: true,
  };
}

/** The original single-design shape. Accepted until the frontend has moved (Phase 5 removes it). */
const legacyOrderSchema = baseOrder.extend({
  design: designSchema,
  totalKits: z.coerce.number().int().min(MIN_TOTAL_KITS).max(MAX_TOTAL_KITS),
  primarySize: z.enum(SIZES),
}).strict().superRefine(deliveryMatchesCountry).transform(legacyToCart);

/**
 * ┌─ A ROUTER, NOT z.union — DO NOT "SIMPLIFY" THIS ──────────────────────────────────────────────┐
 * │ z.union([cart, legacy]) emits a single `invalid_union` issue whose message is "Invalid        │
 * │ input" when both branches fail; the useful per-branch detail is buried in `unionErrors`,      │
 * │ which validate.js does not read. Every malformed order would report "Invalid input" — the     │
 * │ exact bug fixed in fb339b1, on the most important endpoint in the app.                        │
 * │                                                                                               │
 * │ Routing first means failures report the real problem from the branch the caller meant. There  │
 * │ is a test asserting that a body carrying BOTH `items` and `design` names the unrecognized     │
 * │ key; swapping this for z.union passes a status-only test and fails that one.                  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * validate() only ever calls .safeParse, so this is a drop-in for a zod schema. Both branches stay
 * independently .strict(): a body with `items` AND `design` routes to cart, where `design`,
 * `totalKits` and `primarySize` are unrecognized — it cannot satisfy both shapes.
 */
export const createOrderSchema = {
  safeParse(value) {
    const isCart = value !== null && typeof value === 'object' && 'items' in value;
    return isCart ? cartOrderSchema.safeParse(value) : legacyOrderSchema.safeParse(value);
  },
};

/**
 * POST /orders/quote — price a cart in progress. Creates nothing.
 *
 * Its OWN schema, not createOrderSchema: the cart page has no contact details and no address, and
 * demanding them to see a price would be absurd. It reuses cartItemSchema so a line that quotes is
 * a line that can be ordered, with no second definition to drift.
 *
 * No delivery/country superRefine either — that rule needs an address, which arrives at checkout.
 * The cart page sends 'standard' purely so the arithmetic has a delivery row to read; the figure
 * is labelled "delivery calculated at checkout" in the UI.
 */
export const quoteSchema = z.object({
  items: z.array(cartItemSchema)
    .min(1, 'Your cart is empty.')
    .max(MAX_CART_ITEMS, `A cart can hold at most ${MAX_CART_ITEMS} designs.`),
  deliveryId: z.enum(['standard', 'express', 'rush', 'international']),
}).strict();

// A UUID sent per checkout attempt so a double-click returns the first order rather than
// creating a second. Optional: the frontend did not send one historically, and an order without
// a key is still a valid order — just unprotected.
export const idempotencyKeySchema = z.string().uuid().optional();
