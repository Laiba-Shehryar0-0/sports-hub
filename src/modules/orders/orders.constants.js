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
  'Bangladesh', 'Sri Lanka', 'Malaysia', 'Singapore', 'China',
  'Turkey', 'South Africa',
]);

/** standard/express/rush are all domestic couriers — see DELIVERY_METHODS descriptions. */
export const DOMESTIC_DELIVERY_IDS = Object.freeze(['standard', 'express', 'rush']);
export const INTERNATIONAL_DELIVERY_ID = 'international';

/**
 * The provinces and territories a domestic (Pakistan) address can be validated against.
 *
 * Islamabad is deliberately NOT in this list — it is a federal capital territory, not a province,
 * and a checkout address naming it as one is wrong the way naming "Washington D.C." a US state
 * would be. There is no separate "territory" field in the contract for it to go instead; a client
 * shipping there selects the province it's physically administered from (Punjab).
 *
 * Only meaningful for DOMESTIC_COUNTRY — the business has no equivalent list for the other 28
 * SHIPPING_COUNTRIES (US states, Canadian provinces, etc.), so an international address keeps
 * `province` as free text rather than an invented enum. See orders.schema.js's
 * `provinceValidForCountry` for where this splits.
 */
export const PAKISTAN_PROVINCES = Object.freeze([
  'Punjab',
  'Sindh',
  'Khyber Pakhtunkhwa',
  'Balochistan',
  'Gilgit-Baltistan',
  'Azad Jammu & Kashmir',
]);

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
