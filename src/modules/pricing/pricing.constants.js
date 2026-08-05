/**
 * Display labels that have no database home.
 *
 * `kitLabel` comes from kit_prices.kit_label and `deliveryName` from delivery_methods.name, but
 * template and sport are not priced on and have no table — docs/backend-plan.md §3 keeps them as
 * static id->label lookups mirroring DESIGN_TEMPLATES and SPORTS in the frontend's kitShapes.js.
 *
 * Neither map participates in the arithmetic. `template` in particular does NOT affect price at
 * all: BASE_PRICES is keyed by kitType alone (docs/EXTRACTED.md), so it is carried purely so the
 * order summary can render "Football Solid Jersey".
 *
 * If these drift from the frontend the price stays correct and only the label is wrong, which is
 * why an unknown id falls back to the raw id rather than throwing.
 */

export const TEMPLATE_NAMES = Object.freeze({
  'solid': 'Solid',
  'striped': 'Striped',
  'diagonal': 'Diagonal',
  'two-tone': 'Two Tone',
  'hoops': 'Hoops',
  'halves': 'Halves',
  'chevron': 'Chevron',
  'sash': 'Sash',
  'fade': 'Fade',
  'fade-left': 'Side Fade',
  'dots': 'Dots',
  'sleeves': 'Sleeves',
});

// The 5-value enum, matching the catalog sport enum since the 2026-08-03 widening.
export const SPORT_LABELS = Object.freeze({
  'football': 'Football',
  'basketball': 'Basketball',
  'cricket': 'Cricket',
  'training': 'Training',
  'others': 'Others',
});

// Order quantity bounds. 5 is the minimum the checkout UI states and enforces; the server
// enforces it too so the floor is real rather than a client-side nicety.
export const MIN_TOTAL_KITS = 5;
export const MAX_TOTAL_KITS = 500;
