# Kit shape audit

**Written 2026-08-13.** Audit of the SVG silhouettes in `kit-frontend/src/customize/kitShapes.js`
against the 20-product catalog, and the plan to fix them.

The problem in one line: **nine of the twenty products render as the same short-sleeve jersey**, so
Football Jersey, Goalkeeper Shirt and Training Bib are visually identical in the customizer, the
cart and the checkout summary. This is the largest remaining blocker to selling — a shop whose
pictures do not distinguish its products is not describing what it sells.

---

## 1. Where the pieces actually live

Worth stating up front, because none of it is where you would guess:

| Thing | Location |
|---|---|
| The path data | `kitShapes.js` → `getKitPath(type)` (line ~290) |
| The renderer | `KitPreview.jsx` → `KitBody` (line ~308) — **pure SVG, no Fabric.js** |
| **The product → kitType mapping** | **`SPORT_KIT_GROUPS`, a private const in `pages/Customize.jsx` (lines 79–125)** — not exported, not in `kitShapes.js` |
| The catalog copy | `data/kitsSeed.js` (names, blurbs, colours — carries **no** `kitType`) |

`getKitPath` takes **only** `kitType`. Neither `sport` nor `template` reaches it. `template` drives
`TemplateOverlay` — stripes, hoops, sash — which is a *pattern clipped to the body*, orthogonal to
the outline. `sport` currently drives nothing visual whatsoever.

There is no `getKitShape` function; earlier notes referring to one were describing something that
does not exist.

### The viewBox is per-garment, not 100×100

| Shape | viewBox |
|---|---|
| jersey / polo / jumper | `0 0 300 360` |
| shorts | `0 0 280 200` |
| socks | `0 0 160 300` |
| cap | `0 0 300 200` |

This matters beyond drawing. `POSITIONS`, and the `nameXY` / `numberXY` / `logoXY` / `logoSize`
computations in `KitPreview`, are all **fractions of `kit.w` and `kit.h`**. A new torso shape that
keeps `300×360` therefore inherits correct name, number and logo placement for nothing. A new shape
with a different box needs its anchors sanity-checked.

---

## 2. Current state — all 20 products

| # | Product | Sport | kitType | Renders as | Verdict |
|---|---|---|---|---|---|
| 1 | Football Jersey | football | `jersey` | short-sleeve crew | ✅ correct |
| 2 | Goalkeeper Shirt | football | `jersey` | short-sleeve crew | ❌ GK shirts are long-sleeved |
| 3 | Training Bib | football | `jersey` | short-sleeve crew | ❌ a bib is sleeveless |
| 4 | Basketball Jersey | basketball | `jersey` | short-sleeve crew | ❌ basketball is a sleeveless singlet |
| 5 | Training T-Shirt | training | `jersey` | short-sleeve crew | ✅ correct |
| 6 | Training Vest | training | `jersey` | short-sleeve crew | ❌ a vest is sleeveless |
| 7 | Hockey Shirt | others | `jersey` | short-sleeve crew | ✅ correct |
| 8 | Cycling Shirt | others | `jersey` | short-sleeve crew | ⚠️ its own blurb says "full-length zip" |
| 9 | Rugby Shirt | others | `jersey` | short-sleeve crew | ❌ rugby shirts are collared |
| 10 | Cricket Shirt | cricket | `polo` | collared | ✅ correct |
| 11 | Cricket Sweater | cricket | `jumper` | longer jersey | ❌ should be V-neck, long sleeve, ribbed |
| 12 | Warm-up Suit | basketball | `jumper` | longer jersey | ❌ should be a zip / hooded top |
| 13 | Tracksuit | training | `jumper` | longer jersey | ❌ should be a zip / hooded top |
| 14 | Football Shorts | football | `shorts` | shorts | ✅ correct |
| 15 | Basketball Shorts | basketball | `shorts` | shorts | ✅ correct |
| 16 | Training Shorts | training | `shorts` | shorts | ✅ correct |
| 17 | **Cricket Trousers** | cricket | `shorts` | **shorts** | ❌ **full-length trousers drawn as shorts** |
| 18 | Cricket Cap | cricket | `cap` | peaked cap | ✅ correct |
| 19 | **Basketball Headband** | basketball | `cap` | **peaked cap + button** | ❌ **a headband has no peak** |
| 20 | Team Socks | others | `socks` | socks | ✅ correct |

**Collision groups: 9 → jersey, 4 → shorts, 3 → jumper, 2 → cap.** Eleven of twenty products
render as something they are not.

### Two findings that were not in the original brief

**Cricket Trousers renders as shorts.** This is arguably the worst item in the catalog: it
misrepresents the garment's *length* to someone deciding whether to buy trousers. It sat in the
"shorts are fine" bucket precisely because nobody looked at which products were in that bucket.

**Basketball Headband renders as a peaked cap**, complete with brim and top button.

### Two claims that were investigated and are not true as stated

Recorded because acting on either would have produced the wrong fix.

**`jersey` and `polo` are not byte-identical.** Their `body` strings *are* identical, but polo also
draws a notched collar, a placket and two buttons (`KitPreview.jsx:327`). At full size they are
weakly distinguishable. **At the 88×88 cart thumbnail they are not** — a 4-unit placket and two
`r=2.4` buttons inside a 300×360 space fall below one device pixel. So the practical complaint is
right, and the fix is *thumbnail legibility*, not "make polo different from jersey".

**`jumper` is not a long-sleeved tee — its sleeves are proportionally the shorter of the two.**

| | sleeve tip | body span | sleeve reaches |
|---|---|---|---|
| `jersey` | y=138 | 38 → 316 | **36%** down the body |
| `jumper` | y=148 | 42 → 356 | **34%** down the body |

`jumper` is the jersey outline ~4% wider with the hem 40 units lower and a hem band added. Both are
cap sleeves. The defect is real and severe — "a slightly longer jersey" is not a jumper — but the
cause is body length, not sleeve length, and a fix aimed at shortening imaginary long sleeves would
have made it worse.

---

## 3. The constraint that determines the whole design

**`kitType` cannot grow past its current six values.** It is simultaneously:

- a backend zod enum — `z.enum(['jersey','polo','jumper','shorts','socks','cap'])` in
  `orders.schema.js`
- **the pricing key** — `kit_prices.kit_type`, which `computeCartPricing` looks up per line

Adding `sleeveless` as a seventh kitType means a `422 PRICING_UNKNOWN_KIT_TYPE` on every order
containing one, until a migration and a seed row exist for it. And whether a training bib costs
less than a jersey is a *product* decision, not a rendering one — it should not be forced by a
drawing change.

**Therefore: six kitTypes for PRICING, a separate shape dimension for RENDERING.**

```
getKitPath(kitType, kitProduct)
  → product-specific silhouette if PRODUCT_SHAPES has an entry for kitProduct
  → otherwise the kitType default (today's behaviour, unchanged)
```

`kitProduct` **already exists**: it is set from the catalog card, already persisted in
`design_json`, and already in the backend schema as `z.string().max(80).nullable()`.

The consequences of using it are the reason for the choice:

- **No backend change. No migration. No pricing change.**
- **Existing carts keep working** — a stored design already carries `kitProduct`.
- **Existing order records keep rendering** — `order_items.design_json` already has the field.

The alternative — a new `design.shape` field — hits `.strict()` on the design schema and would
`422` every order until the backend shipped in lockstep, and every design saved before that day
would lack it anyway.

### Why the key is a display label, and what guards it

`kitProduct` holds the **label** (`"Goalkeeper Shirt"`), not the slug — set at `Customize.jsx:163`
from `match.item.label`.

Keying rendering off a display string is fragile: rename a product and its silhouette silently
reverts to the kitType fallback. Switching to the slug was considered and rejected — it would break
the `kitLabel` display in `Cart.jsx` and `Checkout.jsx` (both render `kitProduct` directly as the
product name), every cart in a user's localStorage, and every historical order record.

**The guard is a test, not a convention:** every label in `SPORT_KIT_GROUPS` must have an entry in
`PRODUCT_SHAPES`. A rename that misses the map turns a silent wrong silhouette into a red build.
That test is the thing that makes the label key acceptable; it is not optional decoration.

**Accepted trade-off:** a design saved under an old label falls back to its kitType silhouette. An
honest generic fallback beats a confidently wrong shape.

---

## 4. The proposed set — 12 shapes

| Shape key | Status | Products | Distinguishing outline |
|---|---|---|---|
| `jersey` | keep | Football Jersey, Training T-Shirt, Hockey Shirt | short-sleeve crew — the baseline |
| `polo` | keep, **collar strengthened** | Cricket Shirt, Rugby Shirt | wider notched collar, legible at 88px |
| `sleeveless` | **NEW** | Basketball Jersey, Training Vest, Training Bib | no sleeves, deep scooped armholes |
| `long-sleeve` | **NEW** | Goalkeeper Shirt | full sleeves to the wrist |
| `zip-top` | **NEW** | Cycling Shirt | short sleeve, full centre zip, close taper |
| `hoodie` | **NEW** | Tracksuit, Warm-up Suit | long sleeve, hood arc above the shoulders |
| `sweater` | **REWRITE** of `jumper` | Cricket Sweater | V-neck, long sleeve, ribbed cuffs and hem |
| `shorts` | keep | Football / Basketball / Training Shorts | — |
| `trousers` | **NEW** | Cricket Trousers | full-length legs, narrow taper |
| `socks` | keep | Team Socks | — |
| `cap` | keep | Cricket Cap | — |
| `headband` | **NEW** | Basketball Headband | a band — no peak, no button |

**Six new paths and one rewrite.** Two more than originally scoped, because `trousers` and
`headband` came out of the audit.

### Why some products deliberately still share a silhouette

Football Jersey / Training T-Shirt / Hockey Shirt → `jersey`. The two hoodie products → `hoodie`.
The three shorts → `shorts`.

**This is intentional and should not be "fixed" later.** Those garments genuinely have the same
outline. Inventing a difference between a football jersey and a training tee would misrepresent the
product to a buyer — worse than sharing an honest shape. Within each group the distinction is the
product name and the colours, both already shown next to the thumbnail.

### Why there is no sport axis

`sport` will continue to drive nothing in the renderer. The sport already selects the product and
the product selects the shape; a second resolver keyed on sport would be a parallel route to the
same answer, and the two would eventually disagree. One mapping, one direction.

### One deviation needing sign-off: the trousers viewBox

`shorts` is `0 0 280 200` — **landscape**. Trousers are portrait. Full-length legs squashed into a
280×200 box read as shorts, which is the exact defect being fixed.

Proposed: **`trousers` gets its own `0 0 280 420`.** This does not resize an existing category —
`getKitPath` already returns a viewBox per garment and `KitPreview` consumes `kit.viewBox`,
`kit.w`, `kit.h` — it adds one. The instruction "keep the existing viewBox per category" is honoured
for all nine existing shapes; `trousers` is a new category.

The other five new shapes need no new boxes: the five new tops all keep `300×360` (and inherit
text/logo anchors from it), and `headband` fits `0 0 300 200` comfortably, being wide and short.

---

## 5. Implementation plan

### 5.1 `kitShapes.js`

- Add `PRODUCT_SHAPES`: a `{ [product label]: shape key }` map, with a comment stating why the key
  is a label and pointing at the guard test.
- `getKitPath(kitType, kitProduct)` — resolve via `PRODUCT_SHAPES`, fall back to `kitType`, keep the
  existing unknown-type warning and jersey fallback.
- Each returned shape gains a **`family`** field: `'top' | 'legs' | 'socks' | 'head'`. `KitBody`
  currently switches on `kitType` string equality, which cannot survive twelve shapes.
- Add the six new paths and rewrite `jumper` → `sweater`.

### 5.2 `KitPreview.jsx`

- New `kitProduct` prop, defaulting to `null` (so an un-updated call site behaves exactly as today).
- Pass it through to `getKitPath`.
- Four call sites to update: `Customize.jsx`, `Cart.jsx`, `Checkout.jsx`, `KitCanvasEditor.jsx`.
  `Cart.jsx` already has `item.design.kitProduct` in scope.

### 5.3 `KitBody` — feature detection, not type equality

Today:

```js
if (kitType === 'jersey' || kitType === 'polo' || kitType === 'jumper') { … }
  {kitType === 'jumper' && kit.hem && <path … />}
  {kitType === 'polo'   && kit.placket && <>…</>}
```

Becomes: switch on `kit.family`, and let the optional features be **presence-driven** — `kit.hem &&`,
`kit.placket &&`, `kit.cuffs &&`. A new shape then opts into a hem or a placket by including the
key, with no edit to `KitBody`. Without this, `sweater` (ribbed hem) and `zip-top` (centre placket)
each need another `||` in a growing conditional.

### 5.4 `loadEditedKitImage` — a real bug this change would otherwise introduce

`loadEditedKitImage(side, kitType)` tags the flattened drawn-on PNG with the `kitType` it was drawn
on, so a drawing made on a jersey cannot replay on top of a jumper.

Once Training Bib and Basketball Jersey both carry `kitType: 'jersey'` **but render different
silhouettes**, that guard stops working: a drawing made on a bib would replay on a basketball
jersey, which is precisely the class of bug the tag exists to prevent.

**The tag must key on the resolved shape**, not `kitType`. Callers: `Customize.jsx`,
`KitCanvasEditor.jsx` (`saveEditedKitImage(initialSide, url, design.kitType)` at line ~617).
Existing entries tagged with a kitType are treated as stale — the same conservative handling the
function already applies to pre-tagging entries.

### 5.5 Tests

- **The guard**: every `SPORT_KIT_GROUPS` label has a `PRODUCT_SHAPES` entry. Requires exporting
  `SPORT_KIT_GROUPS` from `Customize.jsx`, or moving it — see below.
- Every `PRODUCT_SHAPES` value names a real shape in `getKitPath`.
- Every shape returns a non-empty `body` (or `dome`), a `viewBox`, `w`, `h` and a valid `family` —
  a malformed `d` renders nothing at all, silently.
- `getKitPath(kitType, null)` still returns today's shape for all six kitTypes — the
  backwards-compatibility assertion for stored designs.

**`SPORT_KIT_GROUPS` stays in `Customize.jsx` and gains an `export`.** Moving it into `kitShapes.js`
would drag 20+ PNG imports into the file that is mirrored into this repo. The test is what keeps the
two tables honest.

---

## 6. Where the paths come from

All new paths are **hand-written in the existing coordinate space, derived from the current
`jersey` and `shorts` outlines** — no stock vectors, no external source, nothing traced from
third-party artwork. Concretely, each new top starts from the `jersey` body path and modifies only
the shoulder-to-cuff run, keeping the shared anchors:

| Anchor | Value | Why it is held fixed |
|---|---|---|
| Neck opening | x 112 → 188 at y=38 | collar paths and the `Q` shoulder curve key off it |
| Shoulder ends | (54,52) and (246,52) | where every sleeve variant begins |
| Torso sides | x=52 and x=248 | hem width, and the underarm join |
| Hem | y=316 (tops) | `POSITIONS` fractions assume it |

Holding those four means the name, number and logo anchors — all fractions of `kit.w`/`kit.h` — land
in the same place on every top, and the colour-fill logic (`url(#grad)` on `body`, `collarColor` on
`collar`, `sleeveColor` on the template overlay) is untouched.

Per-shape provenance is recorded in a comment above each path as it is written.

---

## 7. Order of work, and how each step is verified

One shape per step. After each, the browser check is the same three surfaces:

1. **`/customize?kit=<slug>`** — the large preview
2. **`/cart`** — the 88×88 thumbnail, which is the hard case
3. **`/checkout`** — the 72×72 summary thumbnail

| # | Shape | Verify with |
|---|---|---|
| 1 | `sleeveless` | Basketball Jersey, Training Vest, Training Bib |
| 2 | `long-sleeve` | Goalkeeper Shirt |
| 3 | `zip-top` | Cycling Shirt |
| 4 | `hoodie` | Tracksuit, Warm-up Suit |
| 5 | `sweater` | Cricket Sweater |
| 6 | `trousers` | Cricket Trousers |
| 7 | `headband` | Basketball Headband |
| 8 | `polo` collar | Cricket Shirt, Rugby Shirt |

**The regression to watch at every step**, because it is the one a new path breaks silently: put a
player name, a squad number and a logo on the shape and confirm all three still sit on the garment
rather than off its edge. They are positioned as fractions of the viewBox, not of the path, so a
shape that respects the box but moves its torso will place text on empty canvas.

A malformed `d` renders **nothing** — no error, no warning, an empty box. An unexpectedly blank
preview means the path string, not the mapping.
