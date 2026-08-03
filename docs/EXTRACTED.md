# Extracted Literals — `kitShapes.js` & seed data

Source: [kitShapes.js](frontend-reference/kitShapes.js), [kitsSeed.js](frontend-reference/kitsSeed.js), [galleryProductsSeed.js](frontend-reference/galleryProductsSeed.js), [featuredKitsSeed.js](frontend-reference/featuredKitsSeed.js).
Read directly, no guessing. Line numbers refer to `kitShapes.js` unless stated otherwise.

## kitType — `KIT_TYPES` (line 10-17)

```
jersey, polo, jumper, shorts, socks, cap
```

## design.sport (customizer) — `SPORTS`

```
football, basketball, cricket, training, others
```

**Widened 2026-08-03 from 3 values to 5 — this now matches the catalog `sport` enum exactly.**
It previously held only `football, basketball, cricket`. The customizer derives a kit's sport
from the `SPORT_KIT_GROUPS` group that owns it, and those groups are the five catalog values, so
the 8 kits under `training` and `others` had no representable sport. The practical consequence
was that `design.sport` was never written by any code path and every order carried the
`DEFAULT_DESIGN` value (`'football'`), regardless of the kit chosen. The two enums are now the
same set, so the group id can be used directly with no mapping step.

## size — `SIZES` (line 25)

```
S, M, L, XL, Custom
```

Note the literal is `Custom` (capital C), not `CUSTOM`, and there is no `XS` or `XXL`.

## customSizeUnit — `SIZE_UNITS` (line 27-30)

```
in, cm
```

## font — `FONTS` (line 56-67)

```
Bebas Neue, Impact, Georgia, Courier New, Oswald, Anton, Montserrat, Teko, Russo One, Archivo Black
```

## template — `DESIGN_TEMPLATES` (line 69-82)

```
solid, striped, diagonal, two-tone, hoops, halves, chevron, sash, fade, fade-left, dots, sleeves
```

Note the literal is `striped`, not `stripes`.

---

## `DEFAULT_DESIGN` — full field list (line 133-160)

```js
{
  kitType: 'jersey',
  kitProduct: null,
  sport: 'football',
  template: 'solid',
  size: 'M',
  customSize: '',
  customSizeUnit: 'in',
  bodyColor: '#CC0000',
  sleeveColor: '#1a1a1a',
  numberColor: '#FFFFFF',
  collarColor: '#1a1a1a',
  opacity: { body: 100, sleeves: 100, number: 100, collar: 100 },
  playerName: { front: '', back: '' },
  playerNumber: { front: '', back: '' },
  font: 'Bebas Neue',
  nameSize: 14,
  numberSize: 46,
  textPosition: { x: 0.50, y: 0.38 },
  numberPosition: { x: 0.50, y: 0.58 },
  logoDataUrl: null,
  logoPreset: null,
  logoScale: 80,
  logoOpacity: 100,
  logoPosition: { x: 0.28, y: 0.22 },
  layers: { body: true, sleeves: true, number: true, name: true, logo: true },
  layerOrder: ['number', 'name', 'logo', 'sleeves', 'body'],
}
```

25 top-level keys (5 are nested objects/arrays: `opacity`, `playerName`, `playerNumber`,
`textPosition`, `numberPosition`, `logoPosition`, `layers`, `layerOrder` — 8 actually, several
nest further).

---

## `DELIVERY_METHODS` (line 113-118)

| id | name | price (PKR) | priceLabel | days |
|---|---|---|---|---|
| `standard` | Standard Delivery | 0 | Free | 10–14 business days |
| `express` | Express Delivery | 500 | PKR 500 | 5–7 business days |
| `rush` | Rush Order | 1200 | PKR 1,200 | 2–3 business days |
| `international` | International Shipping | 3500 | PKR 3,500 | 12–20 business days |

## `BASE_PRICES` — unit price per kitType (line 104-111)

| kitType | unit price (PKR) |
|---|---|
| jersey | 2800 |
| polo | 2600 |
| jumper | 3200 |
| shorts | 1500 |
| socks | 600 |
| cap | 1200 |

**Keyed by `kitType` only — there is no per-`template` price variation in the source data.**

---

## Catalog `sport` enum — same value set as `design.sport`, different field

From `kitsSeed.js` / `featuredKitsSeed.js`, the `/kits`, `/products`, `/kits/featured` catalog
rows use:

```
cricket, football, basketball, training, others
```

This is the 5-value enum in `API_CONTRACT.md` and CLAUDE.md — correct for the **catalog**
`sport` field. **As of 2026-08-03 `design.sport` uses this same set** (it was widened from 3
values; see the `design.sport` section above). They remain distinct *fields* — one describes a
catalog row, the other the sport a design was built for — but a value valid in one is now valid
in the other, and the customizer derives `design.sport` directly from its `SPORT_KIT_GROUPS`
group id with no mapping step.

---

## Discrepancies vs. `backend-plan.md` §4 zod schema

### `DEFAULT_DESIGN` fields the plan's `designSchema` does not cover

The plan's schema (`backend-plan.md` line 365-386) validates only: `kitType`, `sport`,
`template`, `size`, `customSize`, `customSizeUnit`, `bodyColor`, `sleeveColor`, `numberColor`,
`collarColor`, `playerName`, `playerNumber`, `font`, `logoDataUrl`, `logoPreset`.

**Missing entirely:**

- `kitProduct`
- `opacity` (`{ body, sleeves, number, collar }`)
- `nameSize`
- `numberSize`
- `textPosition` (`{ x, y }`)
- `numberPosition` (`{ x, y }`)
- `logoScale`
- `logoOpacity`
- `logoPosition` (`{ x, y }`)
- `layers` (`{ body, sleeves, number, name, logo }`)
- `layerOrder` (array)

**This is a real bug, not a nitpick.** The schema is written with `.strict()` (per CLAUDE.md
rule 7 and the plan's own line 420 rationale), and the customizer always sends the full
`DEFAULT_DESIGN`-shaped object — every real order payload will include these 11 fields.
`.strict()` rejects unknown keys, so as written, **every legitimate order would fail validation
with a 422.** The schema needs to add all 11 fields (with real bounds — e.g. `opacity`/`logoScale`/
`logoOpacity` as `0-100` ints, `*Position` as `{x,y}` floats in `0-1`, `nameSize`/`numberSize` as
bounded ints, `layerOrder` as an array of the 5 known layer-name literals, `kitProduct` typed
against whatever the customizer actually puts there) — not silently drop them.

### Enums where the plan guessed wrong

| Field | Plan's `backend-plan.md` §4 guess | Actual (`kitShapes.js`) | Verdict |
|---|---|---|---|
| `kitType` | `jersey, shorts, tracksuit, hoodie, cap` | `jersey, polo, jumper, shorts, socks, cap` | **Wrong.** `tracksuit`/`hoodie` don't exist; missing `polo`/`jumper`/`socks`. |
| `design.sport` | `cricket, football, basketball, training, others` (borrowed from the catalog enum) | `football, basketball, cricket, training, others` (widened 2026-08-03) | **Now correct.** The plan's original 5-value guess matches the widened enum; the 3-value set it was checked against no longer exists. |
| `template` | `solid, stripes, halves, gradient, chevron` | `solid, striped, diagonal, two-tone, hoops, halves, chevron, sash, fade, fade-left, dots, sleeves` | **Wrong.** `stripes` should be `striped`; `gradient` doesn't exist; 7 real values missing. |
| `size` | `XS, S, M, L, XL, XXL, CUSTOM` | `S, M, L, XL, Custom` | **Wrong.** No `XS`/`XXL`; literal is `Custom` not `CUSTOM`. |
| `font` | `Bebas Neue, Anton, Oswald, Roboto Condensed, Inter` | `Bebas Neue, Impact, Georgia, Courier New, Oswald, Anton, Montserrat, Teko, Russo One, Archivo Black` | **Wrong.** `Roboto Condensed`/`Inter` don't exist; 6 real values missing. |
| `customSizeUnit` | `in, cm` | `in, cm` | Correct, matches exactly. |

### Bonus: pricing table shape doesn't match the pricing data

The plan's `kit_prices` table (`backend-plan.md` line 246-253) has
`UNIQUE KEY uq_kit_price (kit_type, template)`, implying price varies by template. The actual
`BASE_PRICES` object is keyed by `kitType` alone — there is no template dimension in the source
data at all. The `template` column/key on `kit_prices` models a distinction that doesn't exist
today; either drop it (until proven needed) or confirm with the design owner before building
against a schema that's more granular than the real pricing.

---

## Checkout — `Checkout.jsx`

### 1. Pricing arithmetic (exact)

```js
const unitPrice = BASE_PRICES[design.kitType] ?? 2800;               // fallback if kitType unknown
const delivery  = DELIVERY_METHODS.find(d => d.id === deliveryId) ?? DELIVERY_METHODS[0]; // fallback: standard

const kitPrice  = unitPrice * totalKits;                              // flat linear — no quantity tiers/breaks
const discount  = promoApplied ? Math.round(kitPrice * promoApplied) : 0; // % of kitPrice ONLY — delivery is never discounted
const total     = kitPrice + delivery.price - discount;
```

- **No quantity tiers.** `kitPrice` is a pure `unitPrice × totalKits`; there's no bulk-discount
  breakpoint anywhere in this file.
- **Rounding** happens once, on `discount` (`Math.round(kitPrice * promoApplied)`), because
  `promoApplied` is a fraction (`0.1`/`0.15`) and `kitPrice * 0.1` isn't guaranteed integer.
  `unitPrice`, `totalKits`, `delivery.price` are all already whole PKR ints, so no other rounding
  is needed. `formatPKR()` also does `Math.round(n)` but that's display-only.
- **Discount base is `kitPrice` alone** — delivery price is added *after* discount is subtracted,
  never discounted itself. A server-side `pricingService` must replicate this order of operations
  (`kitPrice → discount off kitPrice → + delivery`), not discount the grand total.
- Matches the `API_CONTRACT.md` example exactly: `unitPrice 2800 × totalKits 11 = kitPrice 30800`;
  `30800 + deliveryPrice 500 - discount 0 = total 31300`. ✅ consistent.
- **No hard minimum-order enforcement in the arithmetic.** The UI text says "Minimum order: 5
  kits" and the quantity stepper's decrement button floors at `Math.max(5, q - 1)`
  (`Checkout.jsx:187`), but nothing stops a value below 5 from reaching `/orders` over the wire —
  the floor is a UI nicety, not a validation rule. **This conflicts with the documented backend
  bound** (CLAUDE.md rule 9 / `backend-plan.md` §4: `totalKits` 1–500). Worth confirming whether
  the backend should also enforce a minimum of 5, since the UI clearly intends one but the
  contract/plan only specify a floor of 1.

### 2. Hardcoded promo codes (`Checkout.jsx:24`)

```js
const PROMO_CODES = { SAVE10: 0.1, HUB15: 0.15 };
```

| Code | Discount type | Value |
|---|---|---|
| `SAVE10` | percent-off `kitPrice` | `0.1` (10%) |
| `HUB15` | percent-off `kitPrice` | `0.15` (15%) |

Matched case-insensitively — input is `.trim().toUpperCase()`'d before lookup
(`Checkout.jsx:80`). No flat-amount codes, no `min_total`, no `max_uses`, no `expires_at` check
client-side — those are `backend-plan.md`'s own additions for the server-side `promo_codes`
table, not present in the frontend today.

### 3. Exact `/orders` request body (`Checkout.jsx:117-125`)

```js
await placeOrder({
  design, contact, address, deliveryId, paymentId,
  totalKits, primarySize, instructions,
  pricing: {
    kitLabel, templateName, sportLabel, unitPrice, kitPrice,
    deliveryName: delivery.name, deliveryPrice: delivery.price,
    discount, promoApplied, total,
  },
});
```

| Field | Source |
|---|---|
| `design` | `loadStoredDesign()` at mount — the full `DEFAULT_DESIGN`-shaped object from `localStorage`, unmodified by Checkout. |
| `contact.firstName/lastName/email/phone` | `TextField` inputs, state init `''`, **required** — `handlePlaceOrder` blocks submission (returns early) if any are empty, so `''` never actually reaches the request for these four. |
| `contact.clubName` | `TextField`, state init `''`, **not required** — can reach the request as `''`. |
| `address.street/city` | `TextField`, state init `''`, **required** — same as firstName/lastName above, blocked from empty submission. |
| `address.province/postalCode` | `TextField`, state init `''`, **not required** — can reach the request as `''`. |
| `address.country` | `TextField`, state init `'Pakistan'`, **not required and has no validation entry at all** — the user can clear this input and submit `''`. See discrepancy below. |
| `deliveryId` | Button group, state init `'express'`, always one of the 4 `DELIVERY_METHODS` ids — never free text. |
| `paymentId` | Button group, state init `'card'`, always one of the 3 `PAYMENT_METHODS` ids. |
| `card.number/expiry/cvv/name` | Collected and **required when `paymentId === 'card'`**, but **never included in the request body** — confirms `API_CONTRACT.md`'s "card details never reach `/orders`" claim. |
| `totalKits` | `useState(11)`, changed via +/- buttons (floor 5) or `QUANTITY_PRESETS` (5/11/15/20) — always a JS number, never a string, no client-side upper bound. |
| `primarySize` | `useState(design.size \|\| 'M')`, changed via `<select>` over `SIZES` — always one of `S/M/L/XL/Custom`, never `''`. |
| `instructions` | `<textarea>`, state init `''`, optional — can reach the request as `''`. |
| `pricing.kitLabel/templateName/sportLabel` | Looked up locally from `KIT_TYPES`/`DESIGN_TEMPLATES`/`SPORTS` by id, with fallback labels (`'Jersey'`/`'Solid'`/`'Football'`) if the lookup misses — always a non-empty string. |
| `pricing.unitPrice/kitPrice/deliveryName/deliveryPrice/discount/total` | Computed as in §1 above. |
| `pricing.promoApplied` | **`null` by default, or the raw discount fraction (`0.1`/`0.15`) if a valid code was applied** — see discrepancy below. |

**`promoCode` (the raw text the user typed) is never sent anywhere in the request.** Only the
resulting fraction (`pricing.promoApplied`) is sent, and it's nested inside the `pricing` object
that the backend is required to discard entirely (CLAUDE.md rule 2 / `backend-plan.md` §1.1).

### 4. Empty string vs. `undefined` vs. `null`

| Field | Can be `''`? | Can be `null`? | Can be `undefined`? |
|---|---|---|---|
| `contact.firstName/lastName/email/phone` | No — blocked by required validation before submit | No | No (state always a string) |
| `contact.clubName` | **Yes** | No | No |
| `address.street/city` | No — required | No | No |
| `address.province/postalCode` | **Yes** | No | No |
| `address.country` | **Yes — no validation prevents clearing it** (see below) | No | No |
| `instructions` | **Yes** | No | No |
| `design.customSize`, `design.logoDataUrl`, `design.logoPreset`, `design.kitProduct` | per `DEFAULT_DESIGN` (`customSize` is `''`; the other three are `null`) | `logoDataUrl`/`logoPreset`/`kitProduct` default `null` | No — `loadStoredDesign()` always merges onto `DEFAULT_DESIGN`, so every key is present |
| `pricing.promoApplied` | No (it's `null` or a number, never `''`) | **Yes — default** | No |
| `totalKits`, `primarySize`, `deliveryId`, `paymentId` | No | No | No |

---

## Contradictions vs. `API_CONTRACT.md` / `backend-plan.md`

1. **`promoApplied` is a discount fraction (`0.1`/`0.15`), not the promo code.** `backend-plan.md`
   §1.1's recompute sketch reads `promoCode: order.pricing?.promoApplied ?? null` and passes it to
   `pricingService.compute()` as if it were a code string — but the frontend never sends the code
   text (`SAVE10`/`HUB15`) anywhere in the request. As written, **the server has no way to know
   which promo code a customer entered**, so it cannot re-validate or re-apply a promo server-side
   at all. Either the frontend needs a small change to send the raw code (e.g. a top-level
   `promoCode` field, alongside — not inside — the discarded `pricing` object), or promo-code
   support needs to be descoped until that's added. This is a contract gap, not just a plan
   mistake: `API_CONTRACT.md`'s example (`"promoApplied": null`) never clarifies the type, which
   is exactly how the plan's wrong assumption happened.
2. **`address.country` can be submitted as `''`.** `Checkout.jsx` gives it a JS default
   (`'Pakistan'`) but no `required` validation — the user can clear the input freely. The schema
   in `backend-plan.md`/`schemas-draft.md`
   (`z.string().trim().min(2).max(80).default('Pakistan')`) will **reject** an explicitly-sent
   `''` with a 422, because `.default()` only fills in for `undefined`, not for a value that's
   present but fails `.min(2)`. Needs the same `z.union(['', ...])`-with-fallback treatment as the
   other optional text fields, or the frontend needs to stop allowing an empty country.
3. **Minimum order of 5 kits is UI-only.** The checkout screen enforces (and states) a 5-kit
   minimum, but neither `API_CONTRACT.md` nor the documented `totalKits` bound (1–500) encodes
   that floor. Worth confirming whether the backend should reject `totalKits < 5`.

---

## UI-enforced bounds — the 11 previously-flagged `DEFAULT_DESIGN` fields

Read directly from `Customize.jsx` (and `KitCanvasEditor.jsx`, which only reads these fields,
never writes them). Where the UI enforces a real limit, it's reported here in place of the
placeholder guesses in `schemas-draft.md`.

| Field | UI-enforced bound | Source |
|---|---|---|
| `opacity.{body,sleeves,number,collar}` | slider `min="0" max="100"` (one shared slider, reused per `applyTarget`) | `Customize.jsx:706` |
| `nameSize` | slider `min={8} max={30}` | `Customize.jsx:783` |
| `numberSize` | slider `min={20} max={80}` | `Customize.jsx:784` |
| `textPosition.{x,y}` | nudge-button grid, clamped to `xMin:0.15, xMax:0.85, yMin:0.12, yMax:0.88` (step `0.035`); center button sets exactly `{x:0.5,y:0.5}` | `Customize.jsx:792` (usage), `814-815` (`POSITION_STEP`/`POSITION_BOUNDS`), `817-819` (`clamp`), `833-836` (clamp applied) |
| `numberPosition.{x,y}` | same `PositionGrid` component, same clamp: `xMin:0.15, xMax:0.85, yMin:0.12, yMax:0.88` | `Customize.jsx:796` |
| `logoScale` | slider `min={30} max={150}` | `Customize.jsx:915` |
| `logoOpacity` | slider `min={0} max={100}` | `Customize.jsx:916` |
| `logoPosition.{x,y}` | same `PositionGrid` component as text/number position, same clamp: `xMin:0.15, xMax:0.85, yMin:0.12, yMax:0.88` | `Customize.jsx:921` |
| `layers.{body,sleeves,number,name,logo}` | no slider/length applies — a fixed 5-key boolean map; `toggleLayer` only flips an existing key's value, the UI has no control to add or remove a key | `Customize.jsx:136-142` (fixed key list, `DEFAULT_LAYER_ORDER`), `234-237` (`toggleLayer`) |
| `layerOrder` | **always a permutation of the same 5 ids, length exactly 5 — resolves the open question in `schemas-draft.md`.** `reorderLayers` only splices an existing id out and reinserts it elsewhere in the same array; there is no code path that adds, removes, or duplicates an entry | `Customize.jsx:239-250` (`reorderLayers`) |
| `kitProduct` | **not a free-text field in the UI at all** — never typed by the user. It's only ever set to the `label` string of one of the 20 fixed catalog items in `SPORT_KIT_GROUPS` (4 items × 5 sport groups), or left `null` if the customizer wasn't opened from a catalog card | `Customize.jsx:69-115` (`SPORT_KIT_GROUPS`, the fixed label set), `151` (set on mount from `?kit=` query param), `538` (set on catalog-item button click) |

### Corrections to `schemas-draft.md`'s placeholder guesses

| Field | `schemas-draft.md` guess | Actual UI bound | 
|---|---|---|
| `nameSize` | `8-40` | `8-30` |
| `numberSize` | `20-120` | `20-80` |
| `logoScale` | `10-200` | `30-150` |
| `textPosition`/`numberPosition`/`logoPosition` | generic `0-1` fraction (from the `POSITIONS` array comment) | tighter: `x: 0.15-0.85`, `y: 0.12-0.88` — the UI never lets these reach the full `0-1` range |
| `layerOrder` | flagged as unresolved (permutation vs. subset/duplicates) | **resolved** — always a full permutation of the 5 fixed ids, enforced by `reorderLayers`'s splice-in-place logic |
| `kitProduct` | flagged as unresolved shape | **partially resolved** — the UI only ever produces one of 20 known label strings or `null`; a schema could safely use `z.enum([...20 labels]).nullable()` to match what the UI sends, though a hand-crafted API request could still send arbitrary text since nothing server-side currently constrains it to this list |

**No enforced limit found for:** none of the 11 fields lack *some* UI-enforced bound — every one
has either a slider, a clamp, a fixed-membership toggle, or a closed set of button-driven values.
The only genuinely open question left is whether the backend should reject a `kitProduct` value
outside the 20 known labels, or accept any string up to some length (in case the catalog grows
without a matching backend update).
