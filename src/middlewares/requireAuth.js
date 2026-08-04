import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import * as authService from '../modules/auth/auth.service.js';

/**
 * Lives in middlewares/ rather than inside the auth module because it's a shared chain component
 * like validate/rateLimiters — /orders and any future /assets need it. Putting it in
 * modules/auth/ would force every feature module to import from a sibling feature (N
 * feature-to-feature edges instead of one middleware-to-feature edge).
 *
 * It imports the SERVICE, never the repository, so this file knows no SQL and jsonwebtoken stays
 * entirely inside the auth module. middleware -> service -> repository mirrors
 * controller -> service -> repository exactly.
 */

function readBearerToken(header) {
  const match = /^Bearer (.+)$/.exec(header ?? '');
  if (!match) {
    throw new AppError('You are not signed in.', {
      statusCode: 401,
      code: 'UNAUTHENTICATED',
    });
  }
  return match[1];
}

export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = readBearerToken(req.headers.authorization);
  const { user, jti } = await authService.authenticateToken(token);

  req.user = user;        // { id, name, email, role }
  req.auth = { jti };
  next();
});
