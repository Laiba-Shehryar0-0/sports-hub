/**
 * Single source of truth for email normalization.
 *
 * Shared deliberately between the login rate-limit key (src/middlewares/rateLimiters.js) and the
 * zod schemas (src/modules/auth/auth.schema.js). If those two ever normalized differently, the
 * limiter would key on a different string than the DB lookup and `LOGIN@x.com` vs `login@x.com`
 * would become separate buckets — a trivial bypass.
 */
export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
