import { AppError } from '../utils/AppError.js';

export function notFound(req, res, next) {
  next(new AppError('Not found.', { statusCode: 404, code: 'NOT_FOUND' }));
}
