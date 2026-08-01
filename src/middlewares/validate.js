import { AppError } from '../utils/AppError.js';

/**
 * Validates req[source] against a zod schema (expected to be `.strict()`).
 * On success, replaces req[source] with the parsed/coerced data.
 * On failure, forwards a 422 AppError with per-field messages in `details`.
 */
export function validate(schema, source = 'body') {
  return function validateMiddleware(req, res, next) {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || source;
        (details[key] ??= []).push(issue.message);
      }
      return next(new AppError('Validation failed.', {
        statusCode: 422,
        code: 'VALIDATION_ERROR',
        details,
      }));
    }

    req[source] = result.data;
    next();
  };
}
