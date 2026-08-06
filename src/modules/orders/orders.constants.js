/**
 * Countries the business ships to, and how that constrains delivery.
 *
 * MUST stay identical to kit-frontend/src/data/countries.js. A drift guard in orders.test.js
 * reads that file and fails if the two lists diverge — the lists are duplicated across repos out
 * of necessity, so the check is what keeps them honest.
 *
 * This is an explicit business decision, not an ISO dump: every entry is somewhere the DHL/FedEx
 * international service actually reaches. Adding a country is a deliberate act.
 */
export const DOMESTIC_COUNTRY = 'Pakistan';

export const SHIPPING_COUNTRIES = Object.freeze([
  'Pakistan',
  'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman',
  'United Kingdom', 'Ireland', 'Germany', 'France', 'Netherlands', 'Belgium',
  'Spain', 'Italy', 'Sweden', 'Norway', 'Denmark',
  'United States', 'Canada',
  'Australia', 'New Zealand',
  'India', 'Bangladesh', 'Sri Lanka', 'Malaysia', 'Singapore', 'China',
  'Turkey', 'South Africa',
]);

/** standard/express/rush are all domestic couriers — see DELIVERY_METHODS descriptions. */
export const DOMESTIC_DELIVERY_IDS = Object.freeze(['standard', 'express', 'rush']);
export const INTERNATIONAL_DELIVERY_ID = 'international';

/**
 * The rule the checkout form and the API both enforce.
 *
 * Without it a UK address could be shipped on `standard` — free "Nationwide courier" — which is
 * both unfulfillable and a straight revenue loss. The inverse (a Pakistan address paying 3500
 * for DHL) is merely wasteful, but equally wrong.
 */
export function allowedDeliveryIds(country) {
  return country === DOMESTIC_COUNTRY
    ? [...DOMESTIC_DELIVERY_IDS]
    : [INTERNATIONAL_DELIVERY_ID];
}

export function isDeliveryAllowedForCountry(country, deliveryId) {
  return allowedDeliveryIds(country).includes(deliveryId);
}
