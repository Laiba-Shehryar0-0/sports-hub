// Snapshot of ../kit-frontend as of 2026-08-15 — reference only, do not edit here.
// Source: src/customize/kitShapes.js

/**
 * SVG path data for each kit type.
 * ViewBox varies per garment — see each getKitPath() case.
 */

import footballBadge   from '../assets/football-badge.png';
import cricketBadge    from '../assets/cricket_badge.png';
import basketballBadge from '../assets/basketball_badge.png';
import { readSavedDesigns, writeStorage } from './designStorage.js';

export const KIT_TYPES = [
  { id: 'jersey', label: 'Jersey' },
  { id: 'polo',   label: 'Polo' },
  { id: 'jumper', label: 'Jumper' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'socks',  label: 'Socks' },
  { id: 'cap',    label: 'Cap' },
];

// Widened from 3 to 5 to match the catalog sport enum and the SPORT_KIT_GROUPS group ids, so
// every kit in the customizer can report a valid sport. Previously 'training' and 'others' had
// no representation here, which left design.sport unwritable for 8 of the 20 catalog kits.
export const SPORTS = [
  { id: 'football',   label: 'Football' },
  { id: 'basketball', label: 'Basketball' },
  { id: 'cricket',    label: 'Cricket' },
  { id: 'training',   label: 'Training' },
  { id: 'others',     label: 'Others' },
];

export const SIZES = ['S', 'M', 'L', 'XL', 'Custom'];

export const SIZE_UNITS = [
  { id: 'in', label: 'inches' },
  { id: 'cm', label: 'cm' },
];

export const COLOR_PALETTE = [
  { hex: '#CC0000', name: 'Red' },
  { hex: '#0033CC', name: 'Royal Blue' },
  { hex: '#1a6bc4', name: 'Sky Blue' },
  { hex: '#006600', name: 'Forest Green' },
  { hex: '#FF6600', name: 'Orange' },
  { hex: '#F5A623', name: 'Gold' },
  { hex: '#000000', name: 'Black' },
  { hex: '#FFFFFF', name: 'White' },
  { hex: '#660066', name: 'Purple' },
  { hex: '#003366', name: 'Navy' },
  { hex: '#4a4a4a', name: 'Charcoal' },
  { hex: '#CC6600', name: 'Bronze' },
  { hex: '#00CCCC', name: 'Teal' },
  { hex: '#8B0000', name: 'Maroon' },
];

export const APPLY_TARGETS = [
  { id: 'body',    label: 'Body' },
  { id: 'sleeves', label: 'Sleeves' },
  { id: 'number',  label: 'Number' },
  { id: 'collar',  label: 'Collar' },
];

export const FONTS = [
  { id: 'Bebas Neue',  label: 'Bebas' },
  { id: 'Impact',      label: 'Impact' },
  { id: 'Georgia',     label: 'Serif' },
  { id: 'Courier New', label: 'Mono' },
  { id: 'Oswald',       label: 'Oswald' },
  { id: 'Anton',        label: 'Anton' },
  { id: 'Montserrat',   label: 'Montserrat' },
  { id: 'Teko',         label: 'Teko' },
  { id: 'Russo One',    label: 'Russo' },
  { id: 'Archivo Black', label: 'Archivo' },
];

export const DESIGN_TEMPLATES = [
  { id: 'solid',    name: 'Solid' },
  { id: 'striped',  name: 'Striped' },
  { id: 'diagonal', name: 'Diagonal' },
  { id: 'two-tone', name: 'Two Tone' },
  { id: 'hoops',    name: 'Hoops' },
  { id: 'halves',   name: 'Halves' },
  { id: 'chevron',  name: 'Chevron' },
  { id: 'sash',     name: 'Sash' },
  { id: 'fade',     name: 'Fade' },
  { id: 'fade-left', name: 'Side Fade' },
  { id: 'dots',     name: 'Dots' },
  { id: 'sleeves',  name: 'Sleeves' },
];

export const BADGE_PRESETS = [
  { id: 'football',   label: 'Football',   image: footballBadge },
  { id: 'cricket',    label: 'Cricket',    image: cricketBadge },
  { id: 'basketball', label: 'Basketball', image: basketballBadge },
];

/** 9-point placement grid — fractional {x,y} anchor within the garment's bounding box */
export const POSITIONS = [
  { id: 'TL', label: '↖', row: 0, col: 0, x: 0.28, y: 0.22 },
  { id: 'TC', label: '↑', row: 0, col: 1, x: 0.50, y: 0.18 },
  { id: 'TR', label: '↗', row: 0, col: 2, x: 0.72, y: 0.22 },
  { id: 'ML', label: '←', row: 1, col: 0, x: 0.24, y: 0.50 },
  { id: 'C',  label: '⊙', row: 1, col: 1, x: 0.50, y: 0.50 },
  { id: 'MR', label: '→', row: 1, col: 2, x: 0.76, y: 0.50 },
  { id: 'BL', label: '↙', row: 2, col: 0, x: 0.28, y: 0.80 },
  { id: 'BC', label: '↓', row: 2, col: 1, x: 0.50, y: 0.84 },
  { id: 'BR', label: '↘', row: 2, col: 2, x: 0.72, y: 0.80 },
];

/**
 * BASE_PRICES was here. DO NOT REINTRODUCE IT.
 *
 * It was a second unit-price table living beside `kit_prices` in the database, agreeing with it
 * by maintenance rather than by mechanism — the drift class that once left the sport enum with
 * three values on one side and five on the other. Checkout read it as
 * `BASE_PRICES[design.kitType] ?? 2800`, so an unknown kit type was silently priced as a jersey.
 *
 * Prices now come from POST /api/orders/quote, which reads kit_prices. If you need a unit price
 * in the browser, ask the server for one — do not add a table here.
 */

/**
 * Delivery methods — NAMES, ETAs and copy. DO NOT ADD `price` OR `priceLabel` BACK.
 *
 * Both fields were here until 2026-08-12: a second delivery price table beside
 * `delivery_methods` in the database, agreeing with it by maintenance rather than by mechanism —
 * the same drift class as the BASE_PRICES note above. They outlived their last reader by one
 * commit, and a dormant price table gets a new one eventually.
 *
 * Delivery money comes from `deliveryOptions` on POST /api/orders/quote, which reads
 * delivery_methods. What the two sides share is `id`; the price attached to that id is the
 * server's to state.
 */
export const DELIVERY_METHODS = [
  { id: 'standard',      name: 'Standard Delivery',      days: '10–14 business days', desc: 'Nationwide courier' },
  { id: 'express',       name: 'Express Delivery',       days: '5–7 business days',   desc: 'Priority production + courier', popular: true },
  { id: 'rush',          name: 'Rush Order',             days: '2–3 business days',   desc: 'Same day production start' },
  { id: 'international', name: 'International Shipping', days: '12–20 business days', desc: 'DHL / FedEx international' },
];

export const QUANTITY_PRESETS = [
  { label: '5 a side',    value: 5 },
  { label: '11 Football', value: 11 },
  { label: '15 Rugby',    value: 15 },
  { label: '20 Squad',    value: 20 },
];

export const PAYMENT_METHODS = [
  { id: 'bank', label: 'Bank Transfer' },
  { id: 'cod',  label: 'Cash on Delivery' },
];

export const DEFAULT_DESIGN = {
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
  // Split by side, like playerName/playerNumber above — moving the name on the back must not
  // move it on the front. logoPosition stays a single {x,y}: the logo only ever renders on the
  // front (KitPreview hardcodes side === 'front' for it), so there is no back position to diverge.
  textPosition: { front: { x: 0.50, y: 0.38 }, back: { x: 0.50, y: 0.38 } },
  numberPosition: { front: { x: 0.50, y: 0.58 }, back: { x: 0.50, y: 0.58 } },
  logoDataUrl: null,
  logoPreset: null,
  logoScale: 80,
  logoOpacity: 100,
  logoPosition: { x: 0.28, y: 0.22 },
  layers: { body: true, sleeves: true, number: true, name: true, logo: true },
  layerOrder: ['number', 'name', 'logo', 'sleeves', 'body'],
};

export const DESIGN_STORAGE_KEY = 'kitlab_current_design';
export const DRAWN_LOGO_KEY = 'kitlab_drawn_logo';
// Flattened, drawn-on kit PNG per side, tagged with the garment it was drawn on — stored as
// { front: { url, kitType }, back: { url, kitType } }.
export const EDITED_KIT_KEY = 'kitlab_edited_kit';
// Full Fabric.js canvas state (strokes, shapes, text — not just the flattened PNG) for the Kit
// Editor, keyed by side, so reopening it continues the same in-progress edit instead of
// re-rendering a fresh blank canvas from the live design every time.
export const KIT_CANVAS_STATE_KEY = 'kitlab_kit_canvas_state';

/**
 * Reads the flattened, drawn-on kit image for one side, if the user has edited and saved it from
 * the Kit Editor. Returns null unless the snapshot was drawn on this exact SHAPE.
 *
 * ┌─ TAGGED BY SHAPE KEY, NOT kitType — AND THAT CHANGED FOR A REASON ────────────────────────────┐
 * │ This used to compare `entry.kitType === kitType`, which was sufficient while one kitType meant │
 * │ one silhouette. It stopped being sufficient the moment product shapes landed: Training Bib and │
 * │ Basketball Jersey are both kitType 'jersey' but render as `sleeveless` and — for the bib —     │
 * │ they are different garments a user draws on differently. Under the old comparison a drawing    │
 * │ made on one would replay on the other, which is precisely the bug the tag exists to prevent,   │
 * │ reintroduced through the side door.                                                            │
 * │                                                                                                │
 * │ Callers pass resolveShapeKey(design.kitType, design.kitProduct). Entries written before this   │
 * │ carry a `kitType` field and no `shape`, and are treated as stale — the same conservative       │
 * │ handling already applied to the untagged entries below. A discarded drawing is recoverable;    │
 * │ one replayed onto the wrong garment silently is not.                                           │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function loadEditedKitImage(side, shapeKey) {
  try {
    const raw = localStorage.getItem(EDITED_KIT_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw)?.[side];
    // Pre-tagging entries were a bare data-URL string with no garment recorded. There's no way
    // to prove which one they came from, so treat them as stale rather than risk the bug
    // this guard exists to stop.
    if (!entry || typeof entry !== 'object') return null;
    return entry.shape === shapeKey ? entry.url : null;
  } catch {
    return null;
  }
}

/** Persists the flattened, drawn-on kit image for one side, tagged with the SHAPE it was drawn
 *  on so it can never be shown for a different silhouette later — see loadEditedKitImage. */
export function saveEditedKitImage(side, dataUrl, shapeKey) {
  try {
    const raw = localStorage.getItem(EDITED_KIT_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[side] = { url: dataUrl, shape: shapeKey };
    localStorage.setItem(EDITED_KIT_KEY, JSON.stringify(parsed));
  } catch {
    /* storage unavailable */
  }
}

/** Clears the saved drawn-on image for one side — used once the live design is customized again
 *  (color/text/logo/etc.), since the frozen snapshot would otherwise silently stop reflecting it. */
export function clearEditedKitImage(side) {
  try {
    const raw = localStorage.getItem(EDITED_KIT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!(side in parsed)) return;
    delete parsed[side];
    localStorage.setItem(EDITED_KIT_KEY, JSON.stringify(parsed));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Loads the current user's most recently saved design into the "in-progress design" slot that
 * Customize.jsx's loadStoredDesign() reads on mount — so navigating to /customize afterwards
 * opens it, the same way reopening the tab reopens whatever was last being edited.
 *
 * Returns true if a saved design existed and was loaded, false if the user has none yet — the
 * caller (Navbar's "My Designs") navigates to /customize either way, since with none saved that
 * is exactly today's behaviour (open the customizer on whatever is already there).
 *
 * Each saved-designs entry carries `id`/`kitTypeLabel` alongside the actual design fields (see
 * Customize.jsx's handleSave) — bookkeeping for a future list UI, not part of the design itself.
 * Both are stripped before writing: the backend's designSchema is `.strict()`, so leaving them in
 * would 422 the moment this design reached an order.
 */
export function loadMostRecentSavedDesign(userId) {
  const saved = readSavedDesigns(userId);
  if (saved.length === 0) return false;

  const { id, kitTypeLabel, ...designFields } = migrateDesign(saved.at(-1));
  writeStorage(DESIGN_STORAGE_KEY, JSON.stringify(designFields));
  return true;
}

/** Migrates a legacy position id (e.g. 'TL') to the {x,y} anchor shape; passes {x,y} values through untouched */
function normalizePosition(value, fallback) {
  if (value && typeof value.x === 'number' && typeof value.y === 'number') return value;
  if (typeof value === 'string') {
    const legacy = POSITIONS.find(p => p.id === value);
    if (legacy) return { x: legacy.x, y: legacy.y };
  }
  return fallback;
}

/** Migrates a legacy single (non-side-specific) name/number string to the {front,back} shape —
 *  applied to both sides so an old saved design still looks the same as before this change. */
function normalizeBySide(value, fallback) {
  if (value && typeof value === 'object') return { front: value.front ?? '', back: value.back ?? '' };
  if (typeof value === 'string' && value) return { front: value, back: value };
  return fallback;
}

/** Migrates a legacy shared (non-side-specific) {x,y} position — or an even older POSITIONS id
 *  string, via normalizePosition — to the {front,back} shape. The same value is applied to both
 *  sides so a design saved before this fix still looks exactly as it did; front and back only
 *  start diverging from the next time either one is moved. */
function normalizeBySidePosition(value, fallback) {
  if (value && typeof value === 'object' && ('front' in value || 'back' in value)) {
    return {
      front: normalizePosition(value.front, fallback.front),
      back: normalizePosition(value.back, fallback.back),
    };
  }
  const shared = normalizePosition(value, null);
  return shared ? { front: shared, back: shared } : fallback;
}

/**
 * Migrates a possibly-legacy design object — whatever shape it was written in, at whatever point
 * in the contract's history that was — to the current DEFAULT_DESIGN-compatible shape.
 *
 * THE ONLY PLACE THIS LOGIC LIVES. `loadStoredDesign` (the single in-progress design) and
 * `cart.js`'s `readCart` (every cart line) both read designs that may predate a contract change —
 * textPosition/numberPosition's {x,y} -> {front,back} split is the one that has actually bitten so
 * far: a cart line added before that shipped still has the old flat shape, and the backend's
 * strict schema now requires {front,back}, so quoting that cart failed with a raw zod
 * "Front: Required" — a validation error with no way for the user to act on it, since nothing in
 * the UI lets them "fix" a field they never touched. Both call sites need the SAME migration, not
 * two hand-copied versions of it that can drift the way the position split itself once did.
 */
export function migrateDesign(parsed) {
  if (!parsed || typeof parsed !== 'object') return DEFAULT_DESIGN;
  return {
    ...DEFAULT_DESIGN,
    ...parsed,
    opacity: { ...DEFAULT_DESIGN.opacity, ...(parsed.opacity || {}) },
    layers: { ...DEFAULT_DESIGN.layers, ...(parsed.layers || {}) },
    textPosition: normalizeBySidePosition(parsed.textPosition, DEFAULT_DESIGN.textPosition),
    numberPosition: normalizeBySidePosition(parsed.numberPosition, DEFAULT_DESIGN.numberPosition),
    logoPosition: normalizePosition(parsed.logoPosition, DEFAULT_DESIGN.logoPosition),
    playerName: normalizeBySide(parsed.playerName, DEFAULT_DESIGN.playerName),
    playerNumber: normalizeBySide(parsed.playerNumber, DEFAULT_DESIGN.playerNumber),
    /**
     * REPAIRS a design saved before maxNumberSizeFor's floor-guard existed. A garment switch onto
     * a tiny safe area (headband, trousers, cap — all below NUMBER_SIZE_MIN) used to store the
     * UNFLOORED maxTextSizeFor value with no minimum, so a design could sit in a cart looking
     * fine while every quote/checkout attempt 422'd on numberSize with no way for the user to see
     * why. A pure floor, not a re-shrink: the render-time clamp in KitPreview (via maxTextSizeFor
     * directly) already independently caps what's actually drawn regardless of this stored value,
     * so raising a corrupted 7/13/15 up to 20 changes nothing on screen — it only makes the value
     * valid again.
     */
    numberSize: Math.max(NUMBER_SIZE_MIN, parsed.numberSize ?? DEFAULT_DESIGN.numberSize),
  };
}

/** Reads the last-edited kit design from localStorage, merged onto DEFAULT_DESIGN */
export function loadStoredDesign() {
  try {
    const raw = localStorage.getItem(DESIGN_STORAGE_KEY);
    if (!raw) return DEFAULT_DESIGN;
    return migrateDesign(JSON.parse(raw));
  } catch {
    return DEFAULT_DESIGN;
  }
}

/**
 * PRODUCT → SILHOUETTE. Keyed by the `kitProduct` LABEL, deliberately.
 *
 * ┌─ WHY A DISPLAY STRING IS THE KEY ─────────────────────────────────────────────────────────────┐
 * │ `kitType` cannot carry this. It is a backend zod enum of six values AND the pricing key       │
 * │ (kit_prices.kit_type), so a seventh value 422s every order with PRICING_UNKNOWN_KIT_TYPE      │
 * │ until a migration and a seed row exist. Whether a bib costs less than a jersey is a product   │
 * │ decision; it must not be forced by a drawing change. So: six kitTypes for PRICING, this map   │
 * │ for RENDERING.                                                                                │
 * │                                                                                               │
 * │ `kitProduct` already exists, is already persisted in design_json, and is already in the       │
 * │ backend schema — so this needs no migration and keeps working for carts and order records     │
 * │ that were saved before it existed. A new `design.shape` field would hit .strict() and 422     │
 * │ every order until the backend shipped in lockstep.                                            │
 * │                                                                                               │
 * │ The cost: it is the LABEL ("Goalkeeper Shirt"), not a slug, because that is what Customize    │
 * │ persists and what Cart and Checkout render as the product name. Rename a product without      │
 * │ updating this map and its silhouette silently reverts to the kitType fallback.                │
 * │                                                                                               │
 * │ THAT IS GUARDED BY A TEST, NOT BY CARE: productShapes.test.js asserts every label in          │
 * │ SPORT_KIT_GROUPS resolves. It turns a silent wrong shape into a red build, and it is the      │
 * │ reason this key is acceptable at all. Do not delete it as redundant.                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Products absent from this map fall back to their kitType shape — which is correct, not a gap:
 * Football Jersey, Training T-Shirt and Hockey Shirt genuinely share one outline, and inventing a
 * difference between them would misrepresent the product. See docs/kit-shape-audit.md §4.
 */
export const PRODUCT_SHAPES = {
  'Basketball Jersey': 'sleeveless',
  'Training Vest':     'sleeveless',
  'Training Bib':      'sleeveless',
  'Goalkeeper Shirt':  'long-sleeve',
  'Cycling Shirt':     'zip-top',
  'Tracksuit':         'hoodie',
  'Warm-up Suit':      'hoodie',
  'Cricket Sweater':   'sweater',
  'Cricket Trousers':  'trousers',
  'Basketball Headband': 'headband',
  'Rugby Shirt':       'polo',
};

/**
 * The shape a design actually renders as. Falls back to kitType when the product has no override.
 *
 * Exported because it is not only the renderer's business: the drawn-on-kit snapshot is tagged
 * with this, so a drawing made on a bib cannot replay on a basketball jersey — the two share
 * kitType 'jersey' and would otherwise be indistinguishable to that guard.
 */
export function resolveShapeKey(kitType, kitProduct = null) {
  return (kitProduct && PRODUCT_SHAPES[kitProduct]) || kitType;
}

/**
 * The actual sleeve outline for the three long-sleeved tops (long-sleeve, hoodie, sweater share
 * identical arm points), as two closed polygons traced from each shape's own body path — shoulder
 * to underarm, the same points the body already uses. Consumed by KitPreview's "Sleeves" template:
 * the generic fractional wedge it falls back to for short-sleeve shapes only reaches 0.35 of the
 * garment's height, so a long sleeve painted with it gets colour on the cap and bare body-colour
 * from the elbow down. Passing this instead clips the accent to the real sleeve, full length.
 */
const LONG_SLEEVE_ZONE =
  'M 246,52 L 288,88 L 296,150 L 278,225 L 260,268 L 238,264 L 242,185 L 248,106 Z ' +
  'M 54,52 L 12,88 L 4,150 L 22,225 L 40,268 L 62,264 L 58,185 L 52,106 Z';

/**
 * Returns SVG path/viewBox data for a garment.
 *
 * `kitProduct` is optional: called with one argument this behaves exactly as it did before product
 * shapes existed, which is what keeps stored designs rendering.
 *
 * `family` decides which renderer branch in KitPreview draws it. KitBody used to switch on kitType
 * string equality, which does not survive a dozen shapes sharing six kitTypes.
 *
 * Note there is no `cx`/`cy`/`r` on new shapes: those keys exist on the original six and nothing
 * has ever read them. Name, number and logo anchors are fractions of `w`/`h` computed in
 * KitPreview, which is why every top keeps the 300x360 box — it inherits placement for free.
 */
export function getKitPath(type, kitProduct = null) {
  switch (resolveShapeKey(type, kitProduct)) {
    case 'jersey':
      return {
        family: 'top',
        viewBox: '0 0 300 360',
        w: 300, h: 360,
        body: 'M 112,38 Q 150,72 188,38 L 246,52 L 288,88 L 296,124 L 268,138 L 248,106 L 248,316 L 52,316 L 52,106 L 32,138 L 4,124 L 12,88 L 54,52 Z',
        collar: 'M 112,38 Q 131,42 150,70 Q 169,42 188,38 L 176,44 L 150,70 L 124,44 Z',
        cx: 150, cy: 200, r: 60,
      };

    /**
     * Sleeveless singlet — Basketball Jersey, Training Vest, Training Bib.
     *
     * PROVENANCE: hand-written from the `jersey` body above, in the same coordinate space. Not
     * traced, not from a stock vector. Only the shoulder-to-underarm run differs; every anchor the
     * rest of the system depends on is held identical to jersey:
     *
     *   neck opening  x 112 -> 188 at y=38   (the collar path below is jersey's, unmodified)
     *   torso sides   x=52 and x=248
     *   hem           y=316
     *
     * What changed, and why it reads as sleeveless at 88px rather than only at full size:
     *   - The shoulder ends pull in from x=246/54 to x=214/86, leaving a 26-unit strap.
     *   - The four sleeve points (288,88 / 296,124 / 268,138 / 248,106 and their mirrors) are gone.
     *   - A cubic sweeps from the strap down to the side seam at y=170, bowing INWARD (control
     *     points at x=206 and x=214 against a 248 side) so the armhole is a scoop cut into the
     *     outline, not a bulge. The gap between torso and arm is what the eye reads at thumbnail
     *     size; a shallow notch would just look like a badly drawn sleeve.
     *
     * The armhole bottoms out 47% down the body (y=170 of 38->316), which is deep — correct for a
     * basketball singlet, and deliberately past the point where it could be mistaken for a cap
     * sleeve.
     */
    case 'sleeveless':
      return {
        family: 'top',
        viewBox: '0 0 300 360',
        w: 300, h: 360,
        body: 'M 112,38 Q 150,72 188,38 L 214,48 C 206,90 214,140 248,170 L 248,316 L 52,316 L 52,170 C 86,140 94,90 86,48 Z',
        collar: 'M 112,38 Q 131,42 150,70 Q 169,42 188,38 L 176,44 L 150,70 L 124,44 Z',
      };
    /**
     * Full-length sleeve to the wrist — Goalkeeper Shirt.
     *
     * PROVENANCE: hand-written from the `jersey` body above, same coordinate space, not traced.
     * The shoulder and cap points are jersey's UNCHANGED (246,52 / 288,88 and their mirrors), so
     * the sleeve starts identically at full size and at thumbnail size — only past the cap does it
     * diverge:
     *
     *   neck opening  x 112 -> 188 at y=38   (collar path is jersey's, unmodified)
     *   shoulder ends (246,52) and (54,52)   (identical to jersey)
     *   torso sides   x=52 and x=248
     *   underarm      (248,106) and (52,106) (identical to jersey — the torso outline below the
     *                                         arm is untouched by sleeve length)
     *   hem           y=316
     *
     * What changed: past the cap (288,88 / 12,88), jersey closes the sleeve immediately (down to
     * y=124, back in to a cuff at y=138, then up to the underarm). This instead keeps going past
     * that point — outward to 296,150 (jersey's own max reach, just lower), tapering the forearm
     * inward through 278,225 to a wrist corner at 260,268, a 22-unit cuff edge to 238,264, then
     * back up the inner seam through 242,185 to the same underarm point jersey uses. Four points
     * per side instead of jersey's two is what keeps the taper looking like an arm and not a flag.
     */
    case 'long-sleeve':
      return {
        family: 'top',
        viewBox: '0 0 300 360',
        w: 300, h: 360,
        body: 'M 112,38 Q 150,72 188,38 L 246,52 L 288,88 L 296,150 L 278,225 L 260,268 L 238,264 L 242,185 L 248,106 L 248,316 L 52,316 L 52,106 L 58,185 L 62,264 L 40,268 L 22,225 L 4,150 L 12,88 L 54,52 Z',
        collar: 'M 112,38 Q 131,42 150,70 Q 169,42 188,38 L 176,44 L 150,70 L 124,44 Z',
        sleeveZone: LONG_SLEEVE_ZONE,
      };
    /**
     * Close-fitting short sleeve with a centre zip — Cycling Shirt.
     *
     * PROVENANCE: hand-written from the `jersey` body above, same coordinate space, not traced.
     * Neck, shoulders, sleeves and the hem corners are jersey's UNCHANGED:
     *
     *   neck opening    x 112 -> 188 at y=38   (collar path is jersey's, unmodified)
     *   shoulder ends   (246,52) and (54,52)
     *   sleeve points   (288,88 / 296,124 / 268,138) and their mirrors — identical to jersey
     *   underarm        (248,106) and (52,106)
     *   hem corners     (248,316) and (52,316)
     *
     * What changed: jersey's torso sides run straight from underarm to hem — a rectangle. This
     * inserts two extra points per side, at y=150 and y=250, pulled in 9 units from the 248/52
     * baseline (to 239/61), then returns to the unchanged hem corners. That waist pinch, held
     * between two anchors that don't move, is what a close taper needs without touching any anchor
     * the rest of the system depends on. `zip: true` is presence-driven like `placket` — KitBody
     * draws the actual zip line from `kit.w`, since a centre zip is always w/2 by construction and
     * doesn't need its own stored path.
     */
    case 'zip-top':
      return {
        family: 'top',
        viewBox: '0 0 300 360',
        w: 300, h: 360,
        body: 'M 112,38 Q 150,72 188,38 L 246,52 L 288,88 L 296,124 L 268,138 L 248,106 L 239,150 L 239,250 L 248,316 L 52,316 L 61,250 L 61,150 L 52,106 L 32,138 L 4,124 L 12,88 L 54,52 Z',
        collar: 'M 112,38 Q 131,42 150,70 Q 169,42 188,38 L 176,44 L 150,70 L 124,44 Z',
        zip: true,
      };
    /**
     * Long sleeve with a hood — Tracksuit, Warm-up Suit.
     *
     * PROVENANCE: hand-written, same coordinate space as the other tops, not traced. The audit
     * (docs/kit-shape-audit.md §4) specs this as long-sleeved, so the sleeve run is the
     * `long-sleeve` shape's above, reused unchanged — shoulder ends (246,52)/(54,52), the taper
     * through the forearm, and underarm (248,106)/(52,106) — along with the same torso sides and
     * hem corners every top shares.
     *
     * The neck is what changes. Every other top's top edge is `Q 150,72 188,38` — a curve that
     * DIPS below the 38-baseline into the collar notch. A hood can't be that: it has to rise ABOVE
     * the shoulder line instead of cutting into it, or it isn't a hood, it's a collar. So the hood
     * base sits a little outside and below the plain neck corners — (108,40) and (192,40), 4 units
     * wider each side, 2 lower — and a cubic arcs up to control points directly above each base
     * (108,4)/(192,4) before descending back down, the same construction the brief's own example
     * curve uses. Apex lands at y≈11 by the curve's own math: 27 units above the neckline, inside
     * the brief's 20-30 range.
     *
     * No `collar` here, deliberately: the hood's fabric covers the neck opening in the silhouette,
     * so the V-neck trim every other top draws inside 112-188 would float inside a dome that no
     * longer has a matching cutout. A hood replaces the neckline; it doesn't sit inside one.
     */
    case 'hoodie':
      return {
        family: 'top',
        viewBox: '0 0 300 360',
        w: 300, h: 360,
        body: 'M 108,40 C 108,4 192,4 192,40 L 246,52 L 288,88 L 296,150 L 278,225 L 260,268 L 238,264 L 242,185 L 248,106 L 248,316 L 52,316 L 52,106 L 58,185 L 62,264 L 40,268 L 22,225 L 4,150 L 12,88 L 54,52 Z',
        sleeveZone: LONG_SLEEVE_ZONE,
      };
    /**
     * V-neck, long sleeve, ribbed cuffs and hem — Cricket Sweater.
     *
     * PROVENANCE: hand-written, same coordinate space as the other tops, not traced.
     *
     * ┌─ WHY THIS IS A NEW CASE, NOT jumper REWRITTEN IN PLACE ──────────────────────────────────┐
     * │ docs/kit-shape-audit.md §4 calls this a "REWRITE of jumper" as a design decision, but      │
     * │ `jumper` is the literal kitType value, and any stored design with kitType 'jumper' and no  │
     * │ kitProduct (or an unrecognized one) resolves through the fallback straight to that case.   │
     * │ Overwriting it in place would silently reshape those — the same class of bug the shape-key │
     * │ tagging on loadEditedKitImage exists to prevent. So `jumper` is untouched below, and this   │
     * │ is a sibling case reached only via PRODUCT_SHAPES['Cricket Sweater'], the same pattern      │
     * │ `long-sleeve` uses for Goalkeeper Shirt against the plain `jersey` case.                    │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * Sleeves, underarm, torso sides and hem corners are `long-sleeve`'s, reused unchanged — the
     * audit specs long sleeve, not jumper's own (already too-short) cap sleeve.
     *
     * The neck is a real V: two straight lines from the plain neck corners (112,40)/(188,40) down
     * to a point at (150,120) — 82 units below the neckline, deep enough to read as a V rather than
     * jersey's 34-unit crew scoop. `collar` traces a thin ribbed band just inside that V, the same
     * outer-curve/inner-curve construction jersey's own collar uses, just following straight V
     * edges instead of a curve.
     *
     * `hem` and `cuffs` are both new ribbed-band elements, presence-driven like `placket`/`zip`:
     * `hem` is a 20-unit band sitting inside the existing 316 hem line (not below it — the old
     * jumper's defect was extending the hem 40 units past every other top's; this stays inside the
     * shared anchor instead of moving it). `cuffs` is one path with two closed sub-paths, a thin
     * band angled across each wrist near the existing long-sleeve cuff points. KitBody renders it
     * with `sleeveColor`, matching how `hem` is already rendered — both are knit-trim colored by
     * the sleeve accent, not the collar accent.
     */
    case 'sweater':
      return {
        family: 'top',
        viewBox: '0 0 300 360',
        w: 300, h: 360,
        body: 'M 112,40 L 150,120 L 188,40 L 246,52 L 288,88 L 296,150 L 278,225 L 260,268 L 238,264 L 242,185 L 248,106 L 248,316 L 52,316 L 52,106 L 58,185 L 62,264 L 40,268 L 22,225 L 4,150 L 12,88 L 54,52 Z',
        collar: 'M 116,42 L 150,110 L 184,42 L 178,46 L 150,102 L 122,46 Z',
        hem: 'M 52,296 L 248,296 L 248,316 L 52,316 Z',
        cuffs: 'M 266,246 L 260,268 L 238,264 L 244,242 Z M 34,246 L 40,268 L 62,264 L 56,242 Z',
        sleeveZone: LONG_SLEEVE_ZONE,
      };
    /**
     * COLLAR STRENGTHENED — Cricket Shirt, Rugby Shirt.
     *
     * docs/kit-shape-audit.md §2 traced the "polo looks like jersey" complaint to its actual
     * cause: the collar/placket/buttons were never absent, they just fall below one device pixel
     * at the 88×88 cart thumbnail (a 4-unit placket, r=2.4 buttons, in a 300-wide viewBox). So this
     * is a legibility fix, not a new shape — body is byte-identical to jersey's, unchanged.
     *
     *   collar: outer tips moved from x=114/186 to x=90/210 (120 units wide, was 72) and the front
     *           notch deepened from y=64 to y=90 — a collar that reads as two wings at thumbnail
     *           size instead of a sliver.
     *   placket: widened from a 4-unit to a 8-unit rectangle.
     *   buttons: KitPreview's button circles are drawn at a hardcoded radius shared by every shape
     *            that sets `buttons` — bumped there from r=2.4 to r=5 (still polo-only today).
     *
     * PRODUCT_SHAPES now also routes Rugby Shirt here — kitType stays 'jersey' (pricing untouched),
     * only the rendered shape changes, same pattern as long-sleeve/Goalkeeper Shirt.
     */
    case 'polo':
      return {
        family: 'top',
        viewBox: '0 0 300 360',
        w: 300, h: 360,
        body: 'M 112,38 Q 150,72 188,38 L 246,52 L 288,88 L 296,124 L 268,138 L 248,106 L 248,316 L 52,316 L 52,106 L 32,138 L 4,124 L 12,88 L 54,52 Z',
        collar: 'M 90,44 L 126,36 L 150,90 L 174,36 L 210,44 L 178,58 L 150,80 L 122,58 Z',
        placket: 'M 146,56 L 154,56 L 154,112 L 146,112 Z',
        buttons: [[150, 76], [150, 98]],
        cx: 150, cy: 200, r: 58,
      };
    case 'jumper':
      return {
        family: 'top',
        viewBox: '0 0 300 360',
        w: 300, h: 360,
        body: 'M 108,42 Q 150,78 192,42 L 252,56 L 294,96 L 300,136 L 270,148 L 248,112 L 248,356 L 52,356 L 52,112 L 30,148 L 0,136 L 6,96 L 48,56 Z',
        collar: 'M 118,42 Q 150,64 182,42 Q 174,56 150,60 Q 126,56 118,42 Z',
        hem: 'M 52,334 L 248,334 L 248,356 L 52,356 Z',
        cx: 150, cy: 210, r: 58,
      };
    case 'shorts':
      return {
        family: 'legs',
        viewBox: '0 0 280 200',
        w: 280, h: 200,
        body: 'M 20,10 L 260,10 L 240,190 L 170,190 L 140,100 L 110,190 L 40,190 Z',
        waistband: 'M 20,10 L 260,10 L 260,35 L 20,35 Z',
        // The default number position (fraction 0.5, 0.58) lands at y=116 on this 200-tall box —
        // straight into the crotch notch between the two legs (fork tip at y=100), off the fabric
        // entirely. Confined to the waist/hip trapezoid above the fork: at its narrowest point
        // here (y=88, just above the fork) the garment spans roughly x=29-251, so x0/x1 sit with
        // margin inside that on both sides at every y in the range.
        textSafeArea: { x0: 45, y0: 18, x1: 235, y1: 88 },
        cx: 140, cy: 120, r: 36,
      };
    /**
     * Full-length legs, narrow taper — Cricket Trousers.
     *
     * PROVENANCE: hand-written from the `shorts` body above, not traced. `shorts` is landscape
     * (`0 0 280 200`) — full-length legs squashed into that box read as shorts, the exact defect
     * being fixed, so this is the one shape in the set that gets its own portrait viewBox,
     * `0 0 280 420` (signed off separately — see docs/kit-shape-audit.md §3). It adds a category
     * rather than resizing one: every other viewBox in this file is unchanged.
     *
     * Waistband, both thighs and the crotch point are `shorts`' own anchors, reused verbatim:
     * (20,10)/(260,10) waist corners, (240,190)/(40,190) outer thighs, (170,190)/(110,190) inner
     * thighs, (140,100) crotch. `shorts` stops there because it's shorts; trousers keeps going.
     *
     * REVISED: the first pass tapered each leg edge through two straight segments (thigh -> a
     * point at y=300 -> a 28-unit ankle). Two straight segments meeting at a fixed point draws a
     * visible kink at y=300 — reads as a knee bump, not a seam — and 28 units against a 70-unit
     * thigh is skinny-fit, not the regular cut cricket trousers actually are. Each edge is now one
     * quadratic curve from thigh straight to ankle (control point at y=300, pulled slightly wider
     * than the straight-line interpolation for a natural convex taper instead of a faceted one),
     * and the hem widened to 40 units — 57% of thigh width, a relaxed leg rather than a pin-leg.
     */
    case 'trousers':
      return {
        family: 'legs',
        viewBox: '0 0 280 420',
        w: 280, h: 420,
        body: 'M 20,10 L 260,10 L 240,190 Q 230,300 218,405 L 178,405 Q 174,300 170,190 L 140,100 L 110,190 Q 106,300 102,405 L 62,405 Q 50,300 40,190 Z',
        waistband: 'M 20,10 L 260,10 L 260,35 L 20,35 Z',
        // Same geometry, same safe area as `shorts` above — the default position fraction would
        // land in the crotch fork here too, and worse: on a 420-tall box a name meant for a
        // 200-tall garment lands even further down, past the fork and into the leg gap entirely.
        textSafeArea: { x0: 45, y0: 18, x1: 235, y1: 88 },
      };
    /**
     * REWORKED AGAIN for clarity — Team Socks.
     *
     * The first rework gave the foot an actual bend, but did it with SIX small Q segments (three
     * per side: instep/toe on one edge, heel on the other), each only 15-25 units long. At full
     * size that reads as intended; at the 88x88 cart thumbnail six short curves in a row blur into
     * visual noise rather than one clean toe-and-heel silhouette. Down to FOUR Q's total — one
     * curve per named feature (instep, toe, heel-under, heel-back) — each spanning the same
     * distance the old three-segment runs did, so the outline is no less rounded, just built from
     * fewer, longer strokes. Toe reach pulled in from x=160 (2 units from the 160-wide viewBox
     * edge — touching it) to x=154, and the tube shortened from y=165 to y=160 to match.
     */
    case 'socks':
      return {
        family: 'socks',
        viewBox: '0 0 160 300',
        w: 160, h: 300,
        body: 'M 40,10 L 120,10 L 120,160 Q 150,163 152,198 Q 154,232 118,244 L 60,244 Q 22,244 20,214 Q 18,180 40,160 Z',
        cuff: 'M 40,10 L 120,10 L 120,38 L 40,38 Z',
        // Text stays on the leg tube — the only straight-walled, constant-width part of the
        // shape. Below y=152 the outline starts curving out toward the foot, so a name/number
        // placed there would straddle the boundary rather than sit on fabric.
        textSafeArea: { x0: 44, y0: 45, x1: 116, y1: 152 },
        cx: 80, cy: 130, r: 30,
      };
    /**
     * BRIM STRAIGHTENED — Cricket Cap.
     *
     * The old brim ('M 10,130 L 240,130 Q 260,130 265,140 Q 270,150 260,155 L 10,155 Z') was a
     * straight strip that only curved out on its RIGHT end (to x=265), while the dome, band and
     * button above it are all symmetric about x=150. A cap viewed from the front has its peak
     * pointing straight at the viewer, not off to one side — the asymmetry read as a drawing
     * error, not a brim in perspective. Rebuilt as two Q curves sharing the same endpoints
     * (20,132)/(280,132): the bottom edge dips to y≈156 at centre (the visible curved leading
     * edge), the top edge dips only to y≈136 (where it meets the band), so the brim is thick in
     * the middle and tapers to a point at both ends — symmetric, and it reads as a peak rather
     * than a flag.
     */
    case 'cap':
      return {
        family: 'head',
        viewBox: '0 0 300 200',
        w: 300, h: 200,
        dome: 'M 30,120 Q 30,20 150,20 Q 270,20 270,120 Z',
        brim: 'M 20,132 Q 150,180 280,132 Q 150,140 20,132 Z',
        band: 'M 30,118 Q 30,108 150,108 Q 270,108 270,118 L 270,128 Q 270,132 150,132 Q 30,132 30,128 Z',
        button: 'M 150,20 m -8,-8 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 Z',
        // Confined to the dome's interior, well clear of both the peak (the arch narrows sharply
        // above y≈48) and the band/brim below (y=108+). Checked against the arch curve itself: at
        // y=48 the dome spans roughly x=56-244, and it only widens moving down toward y=106, so a
        // box from y=48 sits inside the arch at every y in its range, not just at the sampled one.
        textSafeArea: { x0: 75, y0: 48, x1: 225, y1: 106 },
        cx: 150, cy: 80, r: 32,
      };
    /**
     * A band — no peak, no button — Basketball Headband.
     *
     * PROVENANCE: hand-written, same coordinate space and viewBox as `cap` (`0 0 300 200`, wide
     * and short — fits an unrolled band comfortably, no new box needed). Not derived from `cap`'s
     * `dome`, which is a tall peaked arch built for a brim and a button; a headband is neither, and
     * stretching that shape into one is the exact defect this replaces (the old fallback rendered
     * Basketball Headband as a peaked cap, brim and button included). `family: 'head'` reads `dome`
     * unconditionally, and `brim`/`band`/`button` are already presence-driven (`kit.brim &&`, etc.
     * in KitBody) — omitting all three is what removes the peak and the button, with no KitBody
     * change needed.
     *
     * REWORKED for clarity: the first pass's two edges shared endpoints but not curvature — the
     * top arced from y=65 to y=95 (30 units) while the bottom arced from y=140 to y=170 (also 30,
     * but starting 45 units lower) — so the band came out 40 units thick at the ends and 105 thick
     * at the centre. That reads as a thick crescent/blob, not an elastic band of roughly constant
     * width. The two edges below use the SAME curve shape (arcing up through the middle by the
     * same 30 units), just offset by a constant 40-unit baseline — top edge y 60-90, bottom edge y
     * 100-130 — so the band is a uniform 40 units thick everywhere along its length, tapering only
     * at the two straight end caps.
     */
    case 'headband':
      return {
        family: 'head',
        viewBox: '0 0 300 200',
        w: 300, h: 200,
        dome: 'M 20,90 Q 150,60 280,90 L 280,130 Q 150,100 20,130 Z',
        // The band itself is only ~40 units thick, so there is far less usable room than the
        // 300x200 box suggests — checked at the box's own left/right edges (x=110/190, the
        // tightest points since the band is narrowest away from centre): the top curve sits at
        // y≈76 there, comfortably above this box's y0=80, and the bottom curve (built as the top
        // curve offset +40) sits at y≈116, comfortably below y1=112.
        textSafeArea: { x0: 110, y0: 80, x1: 190, y1: 112 },
      };
    default:
      console.warn(`[kitShapes] Unknown shape for kitType "${type}" / product "${kitProduct}" — falling back to jersey.`);
      return getKitPath('jersey');
  }
}

/**
 * A name/number is capped, in KitPreview, at this fraction of whichever of a shape's own
 * dimensions is smaller — nameSize/numberSize are flat point values shared by the sliders across
 * every one of the twelve shapes' very different boxes (jersey 300x360 down to socks 160x300), so
 * an uncapped slider on a small shape can dwarf the garment it's printed on. Exported as one
 * constant, not duplicated as a literal in both KitPreview (the render-time clamp) and
 * `maxTextSizeFor` below (the garment-switch readjustment) — two copies of "0.35" is exactly the
 * kind of pair that quietly drifts apart the next time one gets tuned and the other doesn't.
 */
export const MAX_TEXT_FRACTION = 0.35;

/**
 * Used instead of MAX_TEXT_FRACTION when a shape defines `textSafeArea`. That box is already
 * cropped down to actual fabric — unlike the full viewBox, which for socks/shorts/trousers/
 * cap/headband includes plenty of space the garment doesn't occupy (the crotch gap, the area
 * outside a cap's dome, everything outside a headband's thin band) — so it doesn't need
 * MAX_TEXT_FRACTION's wide margin for error. A bit more generous, since the box is already safe.
 */
export const SAFE_AREA_TEXT_FRACTION = 0.45;

/**
 * The box text is actually confined to for this shape: `textSafeArea` when the shape defines one,
 * or the full viewBox otherwise. A generic fraction of `kit.w`/`kit.h` assumes the garment fills
 * its own box, which is true for every top (the torso already occupies most of its 300x360) but
 * false for socks/shorts/trousers/cap/headband — a name positioned by that same fraction can land
 * in the crotch gap between two shorts legs, or outside a headband's band entirely, no matter how
 * small the font is capped to. `textSafeArea` is the box that's actually always fabric.
 */
export function textBoxFor(kitType, kitProduct = null) {
  const kit = getKitPath(kitType, kitProduct);
  const area = kit.textSafeArea;
  return area
    ? { x0: area.x0, y0: area.y0, w: area.x1 - area.x0, h: area.y1 - area.y0, constrained: true }
    : { x0: 0, y0: 0, w: kit.w, h: kit.h, constrained: false };
}

/**
 * The largest a name/number can render on THIS shape without exceeding it. Exposed so a garment
 * switch can shrink an already-too-big numberSize down to fit the NEW garment immediately, rather
 * than leaving the stored value oversized and relying purely on the render-time clamp to silently
 * hide it. Floored to an integer: nameSize/numberSize are always whole numbers, and a fractional
 * cap would let the slider land one pixel over.
 *
 * On a constrained shape, name and number each get HALF the safe area's height (KitPreview splits
 * it top/bottom — see its own comment), not the full height each: the area is small enough on
 * these shapes (headband: 32 units total) that both mapping onto the SAME full range landed only a
 * few units apart and visibly overlapped. The cap has to shrink to match, or the two would still
 * be sized as if each owned the whole box while actually sharing half of it.
 */
export function maxTextSizeFor(kitType, kitProduct = null) {
  const box = textBoxFor(kitType, kitProduct);
  const fraction = box.constrained ? SAFE_AREA_TEXT_FRACTION : MAX_TEXT_FRACTION;
  const h = box.constrained ? box.h / 2 : box.h;
  return Math.floor(Math.min(box.w, h) * fraction);
}

/**
 * The largest a logo badge can render on THIS shape without exceeding it — same idea as
 * maxTextSizeFor, but unhalved: the logo is front-only and doesn't split its region with name or
 * number the way they now split with each other (see maxTextSizeFor's own comment), so it gets the
 * safe area's FULL height, not half. Exposed for the same reason maxTextSizeFor is: a garment
 * switch shrinks an already-too-big logoScale down to fit the NEW garment immediately, rather than
 * leaving the stored value oversized and relying purely on the render-time clamp to hide it.
 */
export function maxLogoSizeFor(kitType, kitProduct = null) {
  const box = textBoxFor(kitType, kitProduct);
  const fraction = box.constrained ? SAFE_AREA_TEXT_FRACTION : MAX_TEXT_FRACTION;
  return Math.floor(Math.min(box.w, box.h) * fraction);
}

/**
 * logoScale (the 30-150 backend schema range) -> rendered pixel diameter. The one place this
 * formula is written — KitPreview imports it rather than keeping its own copy, and so does
 * maxLogoScaleFor below, so the forward and inverse directions can't quietly drift apart the way
 * two hand-copied formulas would.
 */
export function logoScaleToPx(logoScale) {
  return 18 + (logoScale / 100) * 42;
}

/**
 * The largest logoScale that renders within maxLogoSizeFor on this shape — the inverse of
 * logoScaleToPx, clamped to the schema's own 30-150 bounds. Exposed so a garment switch can shrink
 * an already-too-big logoScale immediately, the same way it shrinks numberSize (see
 * maxTextSizeFor's doc comment). When even the schema's floor (30) would still render larger than
 * the new garment allows, this clamps to that floor rather than going lower — the render-time
 * clamp in KitPreview (via maxLogoSizeFor) is the actual backstop regardless of what gets stored.
 */
export function maxLogoScaleFor(kitType, kitProduct = null) {
  const maxPx = maxLogoSizeFor(kitType, kitProduct);
  const rawScale = ((maxPx - 18) / 42) * 100;
  return Math.max(30, Math.min(150, Math.floor(rawScale)));
}

/** The schema's own numberSize floor (orders.schema.js: numberSize min 20) — also the manual
 *  slider's own `min` in Customize.jsx. One constant so the two cannot drift apart. */
export const NUMBER_SIZE_MIN = 20;

/**
 * The largest numberSize a garment switch may shrink the STORED value to, floored at
 * NUMBER_SIZE_MIN — mirrors maxLogoScaleFor exactly, for exactly the same reason.
 *
 * `maxTextSizeFor` alone is NOT this: it is shared with nameSize's render-time clamp, whose floor
 * is 8, not 20, so it cannot bake in numberSize's floor without wrongly capping nameSize too. A
 * tiny safe area (headband: 7, trousers: 15, cap: 13 — all below 20) previously reached the
 * garment-switch clamp uncapped, producing a design the backend's own schema then rejected on
 * every quote/checkout attempt: valid enough to add to a cart, permanently unable to check out.
 *
 * The render-time clamp in KitPreview (via maxTextSizeFor directly) is unaffected and remains the
 * actual visual backstop regardless of what gets stored — same split as maxLogoSizeFor/
 * maxLogoScaleFor above. A number on a genuinely tiny shape may render slightly fuller than the
 * safe area's own fraction would ideally allow; it was never going to fit at a legible size
 * there regardless, and a small overflow is the honest tradeoff for "this can still be ordered."
 */
export function maxNumberSizeFor(kitType, kitProduct = null) {
  return Math.max(NUMBER_SIZE_MIN, maxTextSizeFor(kitType, kitProduct));
}
