import { z } from 'zod';
import { normalizeEmail } from '../../utils/normalizeEmail.js';

// Piped through the shared normalizeEmail rather than zod's own .trim().toLowerCase() so there is
// exactly one normalization implementation — the login rate-limit key uses the same function.
// .max(190) matches the users.email column width; without it MySQL raises 1406 on INSERT and the
// user gets a 500 instead of a 422.
const emailField = z.string()
  .max(190, 'Email must be 190 characters or fewer.')
  .transform(normalizeEmail)
  .pipe(z.string().email('Enter a valid email address.'));

// Mirrors the client-side rules (min 6, >=1 uppercase, >=1 digit) plus a max the client lacks.
// 128 caps argon2 CPU cost and forecloses bcrypt's silent 72-byte truncation if we ever migrate.
const passwordField = z.string()
  .min(6, 'Password must be at least 6 characters.')
  .max(128, 'Password must be 128 characters or fewer.')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter.')
  .regex(/[0-9]/, 'Password must contain a digit.');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120, 'Name must be 120 characters or fewer.'),
  email: emailField,
  password: passwordField,
}).strict();

// Login deliberately does NOT reuse passwordField. If it enforced the policy, a wrong-format
// password would return 422 with per-field details — which both breaks the contract's exact 401
// body and leaks the password policy to an attacker. Bound the input only; let argon2 decide.
export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required.').max(128),
}).strict();

export const emptyBodySchema = z.object({}).strict();
export const emptyQuerySchema = z.object({}).strict();
