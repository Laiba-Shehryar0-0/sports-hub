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

/**
 * Major Pakistani cities, mapped to the province they're actually in — enough to catch an
 * obvious mistake (city "Karachi", province "Balochistan"), NOT an exhaustive gazetteer.
 *
 * Deliberately NOT a whitelist. Pakistan has hundreds of towns and villages this list will never
 * cover, and a customer from one of them is not lying about their address — they're just not
 * famous. Rejecting an unlisted city would block real orders from real customers for a gap in
 * this list, which is a worse failure than the one this exists to catch. So the rule this backs
 * (orders.schema.js's cityMatchesProvince) only fires when the typed city IS in this map AND
 * disagrees with the selected province — silence for everything else, by design.
 *
 * Islamabad maps to Punjab, not omitted — PAKISTAN_PROVINCES deliberately excludes Islamabad
 * Capital Territory (it's a federal territory, not a province), and the same comment there says a
 * client shipping to Islamabad selects Punjab, the province it's physically administered from.
 * This map has to agree with that or "Islamabad" would silently never match any selected province.
 */
export const MAJOR_CITY_PROVINCE = Object.freeze({
  // Punjab
  lahore: 'Punjab', faisalabad: 'Punjab', rawalpindi: 'Punjab', multan: 'Punjab',
  gujranwala: 'Punjab', sialkot: 'Punjab', bahawalpur: 'Punjab', sargodha: 'Punjab',
  sheikhupura: 'Punjab', 'rahim yar khan': 'Punjab', jhang: 'Punjab', gujrat: 'Punjab',
  kasur: 'Punjab', sahiwal: 'Punjab', okara: 'Punjab', 'wah cantt': 'Punjab',
  'dera ghazi khan': 'Punjab', chiniot: 'Punjab', vehari: 'Punjab', sadiqabad: 'Punjab',
  islamabad: 'Punjab',
  // Sindh
  karachi: 'Sindh', hyderabad: 'Sindh', sukkur: 'Sindh', larkana: 'Sindh',
  nawabshah: 'Sindh', mirpurkhas: 'Sindh', jacobabad: 'Sindh', shikarpur: 'Sindh',
  khairpur: 'Sindh', dadu: 'Sindh', thatta: 'Sindh', badin: 'Sindh',
  sanghar: 'Sindh', ghotki: 'Sindh', umerkot: 'Sindh',
  // Khyber Pakhtunkhwa
  peshawar: 'Khyber Pakhtunkhwa', mardan: 'Khyber Pakhtunkhwa', mingora: 'Khyber Pakhtunkhwa',
  kohat: 'Khyber Pakhtunkhwa', abbottabad: 'Khyber Pakhtunkhwa',
  'dera ismail khan': 'Khyber Pakhtunkhwa', swabi: 'Khyber Pakhtunkhwa',
  nowshera: 'Khyber Pakhtunkhwa', charsadda: 'Khyber Pakhtunkhwa',
  mansehra: 'Khyber Pakhtunkhwa', bannu: 'Khyber Pakhtunkhwa', haripur: 'Khyber Pakhtunkhwa',
  chitral: 'Khyber Pakhtunkhwa', karak: 'Khyber Pakhtunkhwa', swat: 'Khyber Pakhtunkhwa',
  // Balochistan
  quetta: 'Balochistan', turbat: 'Balochistan', khuzdar: 'Balochistan', sibi: 'Balochistan',
  gwadar: 'Balochistan', chaman: 'Balochistan', zhob: 'Balochistan', loralai: 'Balochistan',
  hub: 'Balochistan', mastung: 'Balochistan', kalat: 'Balochistan', panjgur: 'Balochistan',
  pasni: 'Balochistan', nushki: 'Balochistan',
  // Gilgit-Baltistan
  gilgit: 'Gilgit-Baltistan', skardu: 'Gilgit-Baltistan', hunza: 'Gilgit-Baltistan',
  ghanche: 'Gilgit-Baltistan', astore: 'Gilgit-Baltistan', diamer: 'Gilgit-Baltistan',
  ghizer: 'Gilgit-Baltistan', shigar: 'Gilgit-Baltistan', nagar: 'Gilgit-Baltistan',
  // Azad Jammu & Kashmir
  muzaffarabad: 'Azad Jammu & Kashmir', mirpur: 'Azad Jammu & Kashmir',
  rawalakot: 'Azad Jammu & Kashmir', kotli: 'Azad Jammu & Kashmir',
  bhimber: 'Azad Jammu & Kashmir', bagh: 'Azad Jammu & Kashmir',
  palandri: 'Azad Jammu & Kashmir', 'hattian bala': 'Azad Jammu & Kashmir',
  neelum: 'Azad Jammu & Kashmir',
});

/**
 * Looks up a city's known province, case/whitespace-insensitively. Returns null (not "unknown" as
 * a string) for anything not in MAJOR_CITY_PROVINCE — the caller's job is to treat "not in the
 * map" as "nothing to check", not as a mismatch.
 */
export function provinceForCity(city) {
  const key = city.trim().toLowerCase();
  return MAJOR_CITY_PROVINCE[key] ?? null;
}
