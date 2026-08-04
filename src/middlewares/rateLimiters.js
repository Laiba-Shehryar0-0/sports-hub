import rateLimit from 'express-rate-limit';
import { ipKey } from '../utils/ipKey.js';
import { normalizeEmail } from '../utils/normalizeEmail.js';

// Default key for every limiter. Supplying any custom keyGenerator bypasses express-rate-limit's
// own IP handling, so IPv6 normalization is ours to do — see src/utils/ipKey.js for why /64.
const requestIpKey = (req) => ipKey(req.ip);

function makeLimiter({ windowMs, max, message, keyGenerator = requestIpKey }) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    handler(req, res) {
      res.status(429).json({
        message,
        code: 'RATE_LIMITED',
        requestId: req.id,
      });
    },
  });
}

// Baseline for all traffic.
export const globalLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Too many requests. Please try again later.',
});

// /contact and /orders are unauthenticated — the spam/abuse surface
// (docs/backend-plan.md §5).
export const contactLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many submissions. Please try again later.',
});

export const orderLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many orders from this address. Please try again later.',
});

// Login/register brute-force protection, per IP. Applied to /login AND /register, so both share
// one per-IP budget — that's what caps a spray across many different accounts.
export const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts. Please try again later.',
});

// Per IP+email, stacked on top of authLimiter on /login only.
//
// Both are needed and neither is redundant: keyed on IP alone, an attacker gets 20 tries spread
// across unlimited accounts (credential stuffing); keyed on IP+email alone, they get 10 tries per
// account but unlimited accounts from one IP (spray). Together they cap both axes.
//
// The email goes through the shared normalizeEmail so casing/whitespace can't split the bucket,
// and is capped at 190 chars (the users.email column width) — without that cap an attacker can
// push ~100kB keys into the in-process MemoryStore, which is an unbounded-memory primitive.
const loginKey = (req) => `${ipKey(req.ip)}|${normalizeEmail(req.body?.email).slice(0, 190)}`;

export const loginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many sign-in attempts. Please try again later.',
  keyGenerator: loginKey,
});
