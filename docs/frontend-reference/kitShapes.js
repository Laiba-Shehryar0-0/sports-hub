// Snapshot of ../kit-frontend as of 2026-08-13 — reference only, do not edit here.
// Source: src/customize/kitShapes.js

/**
 * SVG path data for each kit type.
 * ViewBox varies per garment — see each getKitPath() case.
 */

import footballBadge   from '../assets/football-badge.png';
import cricketBadge    from '../assets/cricket_badge.png';
import basketballBadge from '../assets/basketball_badge.png';

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
  { id: 'card', label: 'Card' },
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
  textPosition: { x: 0.50, y: 0.38 },
  numberPosition: { x: 0.50, y: 0.58 },
  logoDataUrl: null,
  logoPreset: null,
  logoScale: 80,
  logoOpacity: 100,
  logoPosition: { x: 0.28, y: 0.22 },
  layers: { body: true, sleeves: true, number: true, name: true, logo: true },
  layerOrder: ['number', 'name', 'logo', 'sleeves', 'body'],
};

export const DESIGN_STORAGE_KEY = 'kitlab_current_design';
export const SAVED_DESIGNS_KEY = 'kitlab_saved_designs';
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

/** True once the user has saved a design or placed an order at least once */
export function hasPickedDesign() {
  try {
    if (localStorage.getItem(DESIGN_STORAGE_KEY)) return true;
    const saved = JSON.parse(localStorage.getItem(SAVED_DESIGNS_KEY) || '[]');
    return Array.isArray(saved) && saved.length > 0;
  } catch {
    return false;
  }
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

/** Reads the last-edited kit design from localStorage, merged onto DEFAULT_DESIGN */
export function loadStoredDesign() {
  try {
    const raw = localStorage.getItem(DESIGN_STORAGE_KEY);
    if (!raw) return DEFAULT_DESIGN;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_DESIGN,
      ...parsed,
      opacity: { ...DEFAULT_DESIGN.opacity, ...(parsed.opacity || {}) },
      layers: { ...DEFAULT_DESIGN.layers, ...(parsed.layers || {}) },
      textPosition: normalizePosition(parsed.textPosition, DEFAULT_DESIGN.textPosition),
      numberPosition: normalizePosition(parsed.numberPosition, DEFAULT_DESIGN.numberPosition),
      logoPosition: normalizePosition(parsed.logoPosition, DEFAULT_DESIGN.logoPosition),
      playerName: normalizeBySide(parsed.playerName, DEFAULT_DESIGN.playerName),
      playerNumber: normalizeBySide(parsed.playerNumber, DEFAULT_DESIGN.playerNumber),
    };
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
    case 'polo':
      return {
        family: 'top',
        viewBox: '0 0 300 360',
        w: 300, h: 360,
        body: 'M 112,38 Q 150,72 188,38 L 246,52 L 288,88 L 296,124 L 268,138 L 248,106 L 248,316 L 52,316 L 52,106 L 32,138 L 4,124 L 12,88 L 54,52 Z',
        collar: 'M 114,40 L 132,38 L 150,64 L 168,38 L 186,40 L 168,54 L 150,72 L 132,54 Z',
        placket: 'M 148,60 L 152,60 L 152,104 L 148,104 Z',
        buttons: [[150, 72], [150, 90]],
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
        cx: 140, cy: 120, r: 36,
      };
    case 'socks':
      return {
        family: 'socks',
        viewBox: '0 0 160 300',
        w: 160, h: 300,
        body: 'M 32,8 L 128,8 L 128,180 Q 128,206 150,218 Q 158,224 153,244 L 142,282 Q 136,300 108,300 L 52,300 Q 26,300 20,282 L 11,244 Q 6,224 22,216 Q 32,204 32,180 Z',
        cuff: 'M 32,8 L 128,8 L 128,42 L 32,42 Z',
        cx: 80, cy: 130, r: 30,
      };
    case 'cap':
      return {
        family: 'head',
        viewBox: '0 0 300 200',
        w: 300, h: 200,
        dome: 'M 30,120 Q 30,20 150,20 Q 270,20 270,120 Z',
        brim: 'M 10,130 L 240,130 Q 260,130 265,140 Q 270,150 260,155 L 10,155 Z',
        band: 'M 30,118 Q 30,108 150,108 Q 270,108 270,118 L 270,128 Q 270,132 150,132 Q 30,132 30,128 Z',
        button: 'M 150,20 m -8,-8 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 Z',
        cx: 150, cy: 80, r: 32,
      };
    default:
      console.warn(`[kitShapes] Unknown shape for kitType "${type}" / product "${kitProduct}" — falling back to jersey.`);
      return getKitPath('jersey');
  }
}
