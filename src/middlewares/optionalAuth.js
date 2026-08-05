import { asyncHandler } from '../utils/asyncHandler.js';
import * as authService from '../modules/auth/auth.service.js';

/**
 * Attaches req.user when a valid bearer token is present, and does nothing otherwise.
 *
 * Unlike requireAuth this never rejects — /orders supports guest checkout (orders.user_id is
 * NULL for guests, with the FK set to ON DELETE SET NULL). A bad or expired token is treated as
 * "no token" rather than an error, so an order still succeeds as a guest instead of a signed-out
 * customer losing their basket to a 401.
 */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  if (!match) return next();

  try {
    const { user, jti } = await authService.authenticateToken(match[1]);
    req.user = user;
    req.auth = { jti };
  } catch {
    // Deliberately swallowed. Left as a guest.
  }
  next();
});
