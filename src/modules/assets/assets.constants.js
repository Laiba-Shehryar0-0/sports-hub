/**
 * Shared between the assets module (which mints these URLs) and the orders module (which must
 * accept an already-uploaded one). Kept in a constants file rather than exported from
 * assets.service so a schema never has to import a service — orders.schema pulling in
 * assets.service would drag its module-load side effects (the temp-dir guard and mkdirSync)
 * into every context that merely wants to validate a shape.
 */

/** Route prefix under which stored logos are served. assets.service builds URLs from this. */
export const LOGO_URL_PREFIX = '/static/logos';

/**
 * A logo URL this server issued: the prefix plus a UUID key and the .webp sharp always produces.
 *
 * Deliberately exact rather than a loose `startsWith` check. This value is written straight into
 * design_json and later rendered as an <img src>, so anything looser would let a client store a
 * path of its own choosing — `/static/logos/../../etc/passwd`, or an off-site URL that turns every
 * order page into a tracking beacon. The filename can only be something randomUUID() produced.
 */
export const STORED_LOGO_URL_RE =
  /^\/static\/logos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

/** True for a URL this server issued for a stored logo. */
export function isStoredLogoUrl(value) {
  return typeof value === 'string' && STORED_LOGO_URL_RE.test(value);
}

/**
 * Upper bound on an inline data URL, in characters. 8MB of base64 is roughly 6MB decoded, matching
 * the 6mb body limit on the routes that carry one (CLAUDE.md rules 9 and 10).
 */
export const MAX_DATA_URL_CHARS = 8_000_000;

/**
 * Shape check on the data-URL prefix. NOT a security control — the prefix is client-supplied and
 * proves nothing about the bytes. What actually decides the type is the magic-byte sniff in
 * assets.service; this only rejects obvious nonsense before we bother decoding megabytes.
 */
export const DATA_URL_PREFIX_RE = /^data:image\/(png|jpeg|jpg|webp);base64,/;
