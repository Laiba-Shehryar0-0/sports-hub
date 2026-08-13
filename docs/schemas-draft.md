# Schemas draft — rewritten from EXTRACTED.md

Replaces the `designSchema` / `createOrderSchema` sketch in `backend-plan.md` §4. Every enum
below is copied verbatim (including casing) from [EXTRACTED.md](EXTRACTED.md),
which was read directly from `kitShapes.js`. Nothing here is copy-pasted from the old plan without
re-checking it against that source.

**Update:** the numeric/position bounds below now come from `EXTRACTED.md`'s "UI-enforced bounds"
section (read directly from `Customize.jsx`'s sliders and position-grid clamp), replacing the
earlier placeholder guesses. `kitProduct`, `country`, `totalKits`, and promo-code handling are
settled by explicit product decisions (noted inline) rather than inferred from the UI.

```js
const HEX = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

// Optional contract fields arrive as '' not undefined — z.string().email() fails on ''.
const optionalEmail = z.union([z.literal(''), z.string().email()]).optional().default('');
const optionalText = (max) => z.string().max(max).optional().default('');

// 0-100 integer percentage — used by every opacity-style field.
const pct = z.number().int().min(0).max(100);

// Position-grid clamp bounds — shared by textPosition, numberPosition, logoPosition.
// The UI never lets these reach the full 0-1 range (Customize.jsx:814-815, POSITION_BOUNDS).
const posX = z.number().min(0.15).max(0.85);
const posY = z.number().min(0.12).max(0.88);
const position = z.object({ x: posX, y: posY }).strict();

const LAYER_IDS = ['body', 'sleeves', 'number', 'name', 'logo'];

const designSchema = z.object({
  kitType: z.enum(['jersey', 'polo', 'jumper', 'shorts', 'socks', 'cap']),

  // Product decision: plain string, not an enum against the 20 known catalog labels —
  // leaves room for the catalog to grow without a matching backend deploy.
  kitProduct: z.string().max(80).nullable(),

  // WIDENED 2026-08-03 from 3 values to 5, so this now matches the catalog sport enum used by
  // /kits, /products, /kits/featured. Why: SPORT_KIT_GROUPS in the customizer has five groups
  // (cricket/football/basketball/training/others) and a kit's sport is derived from the group
  // that owns it. Under the old 3-value enum the 8 kits in `training` and `others` had no
  // representable sport, so design.sport was never written at all and every order reported the
  // DEFAULT_DESIGN value ('football'). Keeping the two enums identical removes that whole class
  // of bug — there is no longer a mapping step that can fail.
  sport: z.enum(['football', 'basketball', 'cricket', 'training', 'others']),

  template: z.enum([
    'solid', 'striped', 'diagonal', 'two-tone', 'hoops', 'halves',
    'chevron', 'sash', 'fade', 'fade-left', 'dots', 'sleeves',
  ]),

  size: z.enum(['S', 'M', 'L', 'XL', 'Custom']),
  customSize: optionalText(40),
  customSizeUnit: z.enum(['in', 'cm']).optional().default('in'),

  bodyColor: HEX, sleeveColor: HEX, numberColor: HEX, collarColor: HEX,

  opacity: z.object({
    body: pct, sleeves: pct, number: pct, collar: pct,
  }).strict(),

  playerName: z.object({
    front: z.string().max(20).default(''),
    back:  z.string().max(20).default(''),
  }).strict(),

  playerNumber: z.object({
    front: z.string().regex(/^\d{0,3}$/).default(''),
    back:  z.string().regex(/^\d{0,3}$/).default(''),
  }).strict(),

  font: z.enum([
    'Bebas Neue', 'Impact', 'Georgia', 'Courier New', 'Oswald',
    'Anton', 'Montserrat', 'Teko', 'Russo One', 'Archivo Black',
  ]),

  // UI-enforced: Customize.jsx:783 (SliderRow min={8} max={30}).
  nameSize: z.number().int().min(8).max(30),
  // UI-enforced: Customize.jsx:784 (SliderRow min={20} max={80}).
  numberSize: z.number().int().min(20).max(80),

  textPosition: position,
  numberPosition: position,

  logoDataUrl: z.string().max(8_000_000)
    .regex(/^data:image\/(png|jpeg|webp);base64,/)
    .nullable().default(null),

  // BADGE_PRESETS (kitShapes.js:84-88) only ever produces these 3 ids.
  logoPreset: z.enum(['football', 'cricket', 'basketball']).nullable().default(null),

  // UI-enforced: Customize.jsx:915 (SliderRow min={30} max={150}).
  logoScale: z.number().int().min(30).max(150),
  logoOpacity: pct,
  logoPosition: position,

  layers: z.object({
    body: z.boolean(), sleeves: z.boolean(), number: z.boolean(),
    name: z.boolean(), logo: z.boolean(),
  }).strict(),

  // UI-enforced: reorderLayers (Customize.jsx:239-250) only splices an existing id to a new
  // index — it can never add, remove, or duplicate one. Always a full permutation of the 5 ids.
  layerOrder: z.array(z.enum(LAYER_IDS)).length(5)
    .refine(arr => new Set(arr).size === 5, { message: 'layerOrder must contain each layer exactly once' }),
}).strict();

export const createOrderSchema = z.object({
  design: designSchema,

  contact: z.object({
    firstName: z.string().trim().min(1).max(60),
    lastName:  z.string().trim().min(1).max(60),
    email:     z.string().trim().toLowerCase().email().max(190),
    phone:     z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/),
    clubName:  optionalText(120),
  }).strict(),

  address: z.object({
    street: z.string().trim().min(1).max(255),
    city:   z.string().trim().min(1).max(100),
    province: optionalText(100),
    postalCode: optionalText(20),
    // Product decision: required, no default. The Checkout UI has no validation preventing an
    // empty country (TextField isn't marked required), but the .default('Pakistan') that used to
    // sit here can't rescue an explicitly-sent '' — .default() only fires on undefined. Rather
    // than paper over that with a union-with-empty-string, country is now a hard requirement.
    country: z.string().trim().min(2).max(80),
  }).strict(),

  // Matches DELIVERY_METHODS ids verbatim (kitShapes.js:113-118).
  deliveryId: z.enum(['standard', 'express', 'rush', 'international']),
  // Matches PAYMENT_METHODS ids verbatim (kitShapes.js:127-131).
  paymentId:  z.enum(['card', 'bank', 'cod']),

  // Product decision: floor raised from 1 to 5, matching the Checkout UI's stated minimum order
  // (Checkout.jsx:187, the quantity stepper's Math.max(5, q - 1) floor) instead of only the
  // stepper enforcing it client-side.
  totalKits:  z.coerce.number().int().min(5).max(500),
  // Same enum as design.size — must stay in sync with it.
  primarySize: z.enum(['S', 'M', 'L', 'XL', 'Custom']),
  instructions: optionalText(1000),

  // Accepted so the request validates, then IGNORED. Never trusted, never stored (CLAUDE.md rule 2).
  // Product decision: promo codes are out of scope for now — the frontend never sends the raw
  // code text (see EXTRACTED.md's Checkout section), only a discount fraction buried in this
  // discarded object, so the server cannot safely re-derive which code was used. Discount is
  // always computed as 0 server-side until a top-level `promoCode` field is added to the contract.
  pricing: z.any().optional(),
}).strict();
```

> **Dated record.** `design`, `totalKits` and `primarySize` were removed from the live schema on
> 2026-08-13 (cart Phase 5) in favour of `items: [{ design, size, quantity }]`. The 5-kit floor
> defended above still exists — it just applies across the whole cart now, checked in
> `computeCartPricing` rather than as a bound on one field. The draft is kept as written because
> the reasoning for each bound is the argument, and that has not changed.

---

## Bounds — final, with source

| Field | Bound | Source |
|---|---|---|
| `kitProduct` | `z.string().max(80).nullable()`, not an enum | Product decision — the UI only ever produces one of 20 known catalog labels or `null` (`Customize.jsx:69-115`), but the schema deliberately doesn't hard-enum against that list so the catalog can grow without a backend redeploy. |
| `opacity.{body,sleeves,number,collar}` | `int, 0-100` | UI-enforced: `Customize.jsx:706` (slider `min="0" max="100"`). |
| `nameSize` | `int, 8-30` | UI-enforced: `Customize.jsx:783`. |
| `numberSize` | `int, 20-80` | UI-enforced: `Customize.jsx:784`. |
| `textPosition.{x,y}` | `x: 0.15-0.85`, `y: 0.12-0.88` | UI-enforced: `Customize.jsx:814-815` (`POSITION_BOUNDS`), `817-819` (`clamp`), `833-836` (applied). |
| `numberPosition.{x,y}` | `x: 0.15-0.85`, `y: 0.12-0.88` | Same `PositionGrid`/clamp as `textPosition` (`Customize.jsx:796`). |
| `logoScale` | `int, 30-150` | UI-enforced: `Customize.jsx:915`. |
| `logoOpacity` | `int, 0-100` | UI-enforced: `Customize.jsx:916`. |
| `logoPosition.{x,y}` | `x: 0.15-0.85`, `y: 0.12-0.88` | Same `PositionGrid`/clamp as `textPosition` (`Customize.jsx:921`). |
| `layers.{body,sleeves,number,name,logo}` | `boolean`, exactly these 5 keys | UI-enforced: `Customize.jsx:136-142` (fixed key list), `234-237` (`toggleLayer` only flips an existing key). |
| `layerOrder` | array of the 5 layer-id literals, `length(5)`, no duplicates | UI-enforced: `Customize.jsx:239-250` (`reorderLayers` only repositions, never adds/removes/duplicates). |
| `address.country` | required, `.min(2).max(80)`, no default | Product decision — the Checkout UI has no `required` validation on this field (`Checkout.jsx:241`), so a client could send `''`; rather than special-case an empty country, it's now a hard requirement server-side. |
| `totalKits` | `.min(5).max(500)` | Product decision, matching the Checkout UI's stated 5-kit minimum (`Checkout.jsx:187`) instead of leaving the floor at 1. |
| `pricing` / promo codes | `z.any().optional()`, discarded; discount always `0` server-side | Product decision — promo-code support is out of scope until the frontend sends a top-level `promoCode` field (see "Known gaps" in `backend-plan.md`). |

No open/unresolved bounds remain — every field in this draft now has either a UI-measured limit
or an explicit product decision behind it.
