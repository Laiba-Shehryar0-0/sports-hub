import { z } from 'zod';
import { MAX_TOTAL_KITS, MAX_CART_ITEMS } from '../pricing/pricing.constants.js';
import {
  SHIPPING_COUNTRIES, DOMESTIC_COUNTRY, PAKISTAN_PROVINCES,
  allowedDeliveryIds, isDeliveryAllowedForCountry,
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

// textPosition/numberPosition are per side — moving the name on the back must not move it on the
// front, so front and back are independent {x,y} pairs, same shape as playerName/playerNumber
// below. logoPosition stays a plain `position`: the logo only ever renders on the front, so there
// is no back position for it to have.
const positionBySide = z.object({ front: position, back: position }).strict();

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

  textPosition: positionBySide,
  numberPosition: positionBySide,

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
  // The authoritative ordered size, and the one that reaches order_items.size. `design.size` is
  // part of the design SNAPSHOT — what the customizer had selected when the line was added — and
  // is deliberately not cross-checked against this. They answer different questions, and a design
  // reused across two sizes is a normal cart, not a contradiction.
  size: z.enum(SIZES),
  // Per line, the floor is 1. The 5-kit minimum is CART-WIDE and is enforced in
  // computeCartPricing, so 3 jerseys + 2 shorts is a valid order.
  quantity: z.coerce.number().int().min(1).max(MAX_TOTAL_KITS),
}).strict();

/**
 * The order payload, minus `items`.
 *
 * Kept as a separate object rather than inlined because `.strict()` has to be applied to the
 * FINAL shape — extending a strict object and re-striking it is the only way to add `items` and
 * still reject unknown keys. Until Phase 5 there was a second branch extending this too.
 */
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
    // Base type only allows blank-or-short-string; whether blank is actually acceptable depends
    // on `country` and is enforced by provinceValidForCountry below, not here — a Pakistan
    // address must name one of PAKISTAN_PROVINCES, an international one has no such list to check
    // against and stays free text.
    province: z.string().trim().max(100).optional().default(''),
    // A fixed list, not free text. This also RESOLVES docs/EXTRACTED.md discrepancy #2: country
    // could previously be submitted as '' because the old TextField had no required-validation.
    // A dropdown always has a value, so '' is no longer producible and no longer accepted.
    country: z.enum(SHIPPING_COUNTRIES),
  }).strict(),
  deliveryId: z.enum(['standard', 'express', 'rush', 'international']),
  paymentId: z.enum(['bank', 'cod']),
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
 * unfulfillable and a direct revenue loss.
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

/**
 * Cross-field rule: a Pakistan address must name a real province; anywhere else, "province" has
 * no enumerable list to check against (no US-states/Canadian-provinces table exists here), so it
 * stays free text and may be blank.
 */
function provinceValidForCountry(order, ctx) {
  if (order.address.country === DOMESTIC_COUNTRY && !PAKISTAN_PROVINCES.includes(order.address.province)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['address', 'province'],
      message: 'Select a valid province.',
      params: { allowed: PAKISTAN_PROVINCES },
    });
  }
}

/**
 * The multi-item shape the cart sends — the ONLY shape accepted, since Phase 5.
 *
 * ┌─ THE LEGACY SINGLE-DESIGN BRANCH WAS REMOVED ON 2026-08-13 ───────────────────────────────────┐
 * │ Until then a body of `{ design, totalKits, primarySize }` was accepted and normalised into a  │
 * │ one-item cart by a hand-written router (deliberately not z.union, whose `invalid_union`       │
 * │ issue reports a useless "Invalid input"). The frontend has sent `items[]` since Phase 4, and  │
 * │ browser verification confirmed it end to end, so the branch had no callers left.              │
 * │                                                                                               │
 * │ A legacy body now fails HERE, as unrecognized keys plus a missing `items` — which is the       │
 * │ correct outcome and is asserted by a test. Do not add a compatibility shim: the columns those  │
 * │ payloads wrote (design_json, unit_price, primary_size) were dropped in migration 008, so an    │
 * │ accepted legacy order would have nowhere to put half of itself.                                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const createOrderSchema = baseOrder.extend({
  items: z.array(cartItemSchema)
    .min(1, 'Your cart is empty.')
    .max(MAX_CART_ITEMS, `A cart can hold at most ${MAX_CART_ITEMS} designs.`),
}).strict().superRefine(deliveryMatchesCountry).superRefine(provinceValidForCountry);

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

// GET /orders and GET /orders/:reference take no query string. .strict() so an unexpected key
// (a stray ?status= someone assumes exists, say) 422s instead of being silently ignored.
export const emptyQuerySchema = z.object({}).strict();

// Matches exactly what buildReference produces: 'KW-<4-digit year>-<6-digit zero-padded id>'.
// Malformed input 422s here rather than reaching a WHERE clause that can only ever match zero
// rows — a cleaner failure than a 404 that gives no hint the reference was never a valid shape.
export const referenceParamSchema = z.object({
  reference: z.string().regex(/^KW-\d{4}-\d{6}$/, 'Not a valid order reference.'),
}).strict();

// GET /orders (mine) pagination. Bounded per CLAUDE.md rule 1 — findOrdersByUser inlines these
// into the SQL string rather than binding them, so this schema IS the safety boundary, not a
// nicety on top of one.
export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();
