import { z } from 'zod';
import { MIN_TOTAL_KITS, MAX_TOTAL_KITS } from '../pricing/pricing.constants.js';

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

  // Bounded here; the bytes are validated by magic-byte sniffing in the assets service, which is
  // the only thing that actually proves what this is. The prefix below is a shape check, not a
  // security control.
  logoDataUrl: z.string().max(8_000_000)
    .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/)
    .nullable().default(null),
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

export const createOrderSchema = z.object({
  design: designSchema,
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
    // Empty-string tolerant: Checkout.jsx defaults it to 'Pakistan' but has no required-validation
    // on it, so a user can clear the field and submit ''. .default() only fills undefined, so a
    // bare .min(2) would 422 a form the UI treats as valid (docs/EXTRACTED.md discrepancy #2).
    country: z.union([z.literal(''), z.string().trim().min(2).max(80)]).optional().default(''),
  }).strict(),
  deliveryId: z.enum(['standard', 'express', 'rush', 'international']),
  paymentId: z.enum(['card', 'bank', 'cod']),
  totalKits: z.coerce.number().int().min(MIN_TOTAL_KITS).max(MAX_TOTAL_KITS),
  primarySize: z.enum(['S', 'M', 'L', 'XL', 'Custom']),
  instructions: optionalText(1000),

  // ACCEPTED, THEN DISCARDED. Never read, never stored, never returned (CLAUDE.md rule 2).
  // Deliberately permissive — spending validation effort on a field that goes straight in the bin
  // would be wasted, and rejecting a malformed one would break checkout for no security gain.
  // The service reads only `pricing.total`, and only to log a price_mismatch warning.
  pricing: z.any().optional(),
}).strict();

// A UUID sent per checkout attempt so a double-click returns the first order rather than
// creating a second. Optional: the frontend did not send one historically, and an order without
// a key is still a valid order — just unprotected.
export const idempotencyKeySchema = z.string().uuid().optional();
