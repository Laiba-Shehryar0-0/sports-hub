import { AppError } from '../utils/AppError.js';

/**
 * Validates req[source] against a zod schema (expected to be `.strict()`).
 * On success, replaces req[source] with the parsed/coerced data.
 * On failure, forwards a 422 AppError with per-field messages in `details`.
 */
/** 'logoDataUrl' -> 'Logo data url'; 'contact.firstName' -> 'First name'. */
function humanizeField(path) {
  const last = path.split('.').pop() ?? '';
  const spaced = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Builds the user-facing `message` from the first issue.
 *
 * The frontend renders `data.message` verbatim, so a constant "Validation failed." made every
 * validation error indistinguishable — a mislabelled logo, a missing field and a smuggled key all
 * read identically, while the sentence that would have helped sat unread in `details`. That is
 * what this fixes.
 *
 * A schema author who writes a message ends it with a full stop, and that message is already
 * phrased for a user ("Logos must be a JPEG, PNG or WebP data URL."), so it is used as-is. zod's
 * own defaults are terse fragments ("Required", "Expected string, received number") that mean
 * nothing without their field, so those get the field name prepended. The heuristic is the
 * trailing full stop; it is worth the small ugliness of being a heuristic because the alternative
 * is prefixing every author-written sentence with a redundant label.
 *
 * Safe to expose: zod messages are either author-written or describe the shape of the caller's own
 * input. Nothing here reveals SQL, table names, paths or driver codes (CLAUDE.md rule 14) — the
 * per-field breakdown in `details` is unchanged and remains the machine-readable form.
 */
function buildMessage(issues, source) {
  const [first] = issues;
  if (!first) return 'Validation failed.';

  const path = first.path.join('.');
  const authored = first.message.trim().endsWith('.');
  const base = authored || !path
    ? first.message
    : `${humanizeField(path)}: ${first.message}`;

  const rest = issues.length - 1;
  if (rest <= 0) return base;
  return `${base} (and ${rest} other problem${rest > 1 ? 's' : ''})`;
}

export function validate(schema, source = 'body') {
  return function validateMiddleware(req, res, next) {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || source;
        (details[key] ??= []).push(issue.message);
      }
      return next(new AppError(buildMessage(result.error.issues, source), {
        statusCode: 422,
        code: 'VALIDATION_ERROR',
        details,
      }));
    }

    req[source] = result.data;
    next();
  };
}
