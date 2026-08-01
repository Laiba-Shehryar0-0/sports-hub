import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

// Never expose driver/internal detail to the client — only AppError messages
// are user-facing. Anything else collapses to a generic 500 (CLAUDE.md: the
// frontend renders `message` directly, so it must never leak SQL/stack/etc).
function toAppError(err) {
  if (err instanceof AppError) return err;

  // express.json() body-parser failures
  if (err.type === 'entity.parse.failed') {
    return new AppError('Invalid request body.', { statusCode: 400, code: 'INVALID_BODY' });
  }
  if (err.type === 'entity.too.large' || err.status === 413) {
    return new AppError('Request body too large.', { statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
  }

  return new AppError('Something went wrong on our end.', {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
  });
}

export function errorHandler(err, req, res, next) {
  const appError = toAppError(err);
  const requestId = req.id;

  const logPayload = { err, requestId };
  if (appError.statusCode >= 500) {
    logger.error(logPayload, 'Unhandled error');
  } else {
    logger.warn(logPayload, appError.message);
  }

  res.status(appError.statusCode).json({
    message: appError.message,
    code: appError.code,
    requestId,
    ...(appError.details ? { details: appError.details } : {}),
  });
}
