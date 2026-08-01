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

export const SPORTS = [
  { id: 'football',   label: 'Football' },
  { id: 'basketball', label: 'Basketball' },
  { id: 'cricket',    label: 'Cricket' },
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

/** Base unit price (PKR) per kit type — used on the checkout page */
export const BASE_PRICES = {
  jersey: 2800,
  polo:   2600,
  jumper: 3200,
  shorts: 1500,
  socks:  600,
  cap:    1200,
};

export const DELIVERY_METHODS = [
  { id: 'standard',      name: 'Standard Delivery',      price: 0,    priceLabel: 'Free',       days: '10–14 business days', desc: 'Nationwide courier' },
  { id: 'express',       name: 'Express Delivery',       price: 500,  priceLabel: 'PKR 500',    days: '5–7 business days',   desc: 'Priority production + courier', popular: true },
  { id: 'rush',          name: 'Rush Order',             price: 1200, priceLabel: 'PKR 1,200',  days: '2–3 business days',   desc: 'Same day production start' },
  { id: 'international', name: 'International Shipping', price: 3500, priceLabel: 'PKR 3,500',  days: '12–20 business days', desc: 'DHL / FedEx international' },
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
// Flattened, drawn-on kit PNG per side — stored as { front, back }.
export const EDITED_KIT_KEY = 'kitlab_edited_kit';
// Full Fabric.js canvas state (strokes, shapes, text — not just the flattened PNG) for the Kit
// Editor, keyed by side, so reopening it continues the same in-progress edit instead of
// re-rendering a fresh blank canvas from the live design every time.
export const KIT_CANVAS_STATE_KEY = 'kitlab_kit_canvas_state';

/** Reads the flattened, drawn-on kit image for one side, if the user has edited and saved it
 *  from the Kit Editor. */
export function loadEditedKitImage(side) {
  try {
    const raw = localStorage.getItem(EDITED_KIT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.[side] || null;
  } catch {
    return null;
  }
}

/** Persists the flattened, drawn-on kit image for one side. */
export function saveEditedKitImage(side, dataUrl) {
  try {
    const raw = localStorage.getItem(EDITED_KIT_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[side] = dataUrl;
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

/** Returns SVG path/viewBox data for each kit type */
export function getKitPath(type) {
  switch (type) {
    case 'jersey':
      return {
        viewBox: '0 0 300 360',
        w: 300, h: 360,
        body: 'M 112,38 Q 150,72 188,38 L 246,52 L 288,88 L 296,124 L 268,138 L 248,106 L 248,316 L 52,316 L 52,106 L 32,138 L 4,124 L 12,88 L 54,52 Z',
        collar: 'M 112,38 Q 131,42 150,70 Q 169,42 188,38 L 176,44 L 150,70 L 124,44 Z',
        cx: 150, cy: 200, r: 60,
      };
    case 'polo':
      return {
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
        viewBox: '0 0 300 360',
        w: 300, h: 360,
        body: 'M 108,42 Q 150,78 192,42 L 252,56 L 294,96 L 300,136 L 270,148 L 248,112 L 248,356 L 52,356 L 52,112 L 30,148 L 0,136 L 6,96 L 48,56 Z',
        collar: 'M 118,42 Q 150,64 182,42 Q 174,56 150,60 Q 126,56 118,42 Z',
        hem: 'M 52,334 L 248,334 L 248,356 L 52,356 Z',
        cx: 150, cy: 210, r: 58,
      };
    case 'shorts':
      return {
        viewBox: '0 0 280 200',
        w: 280, h: 200,
        body: 'M 20,10 L 260,10 L 240,190 L 170,190 L 140,100 L 110,190 L 40,190 Z',
        waistband: 'M 20,10 L 260,10 L 260,35 L 20,35 Z',
        cx: 140, cy: 120, r: 36,
      };
    case 'socks':
      return {
        viewBox: '0 0 160 300',
        w: 160, h: 300,
        body: 'M 32,8 L 128,8 L 128,180 Q 128,206 150,218 Q 158,224 153,244 L 142,282 Q 136,300 108,300 L 52,300 Q 26,300 20,282 L 11,244 Q 6,224 22,216 Q 32,204 32,180 Z',
        cuff: 'M 32,8 L 128,8 L 128,42 L 32,42 Z',
        cx: 80, cy: 130, r: 30,
      };
    case 'cap':
      return {
        viewBox: '0 0 300 200',
        w: 300, h: 200,
        dome: 'M 30,120 Q 30,20 150,20 Q 270,20 270,120 Z',
        brim: 'M 10,130 L 240,130 Q 260,130 265,140 Q 270,150 260,155 L 10,155 Z',
        band: 'M 30,118 Q 30,108 150,108 Q 270,108 270,118 L 270,128 Q 270,132 150,132 Q 30,132 30,128 Z',
        button: 'M 150,20 m -8,-8 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 Z',
        cx: 150, cy: 80, r: 32,
      };
    default:
      return getKitPath('jersey');
  }
}
