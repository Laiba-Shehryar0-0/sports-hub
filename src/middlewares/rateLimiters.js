import rateLimit from 'express-rate-limit';
import { ipKey } from '../utils/ipKey.js';
import { normalizeEmail } from '../utils/normalizeEmail.js';
import { env } from '../config/env.js';

// Default key for every limiter. Supplying any custom keyGenerator bypasses express-rate-limit's
// own IP handling, so IPv6 normalization is ours to do — see src/utils/ipKey.js for why /64.
const requestIpKey = (req) => ipKey(req.ip);

function makeLimiter({ windowMs, max, message, keyGenerator = requestIpKey }) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator,
    // Disabled under NODE_ENV=test. Every request in a suite comes from the same IP, so the
    // limiter would exhaust partway through and fail unrelated assertions with a 429 — as it
    // did on the first run of the orders suite. Limiter behaviour is verified separately against
    // a live server, where the counters are real.
    skip: () => env.NODE_ENV === 'test',
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

// Brute-force protection, per IP. Applied to ALL FOUR auth routes — /register, /login, /verify
// and /resend — so they share one budget. That shared scope is why this number is not small.
//
// 60/15min is deliberate; do not tighten it back without a specific reason. At 20 a single user
// having a bad few minutes (register, a few wrong passwords, a fumbled code, a resend) could
// exhaust it alone — and behind NAT, an office or mobile carrier shares one egress IP, so that
// one fumbled signup locked out everyone else on it.
//
// Raising it is safe because this limiter never did the per-account work:
//   - loginLimiter caps per IP+email at 10/15min (per-account brute force)
//   - the DB caps 5 attempts per code, 10 resends, 60s cooldown — and unlike this in-memory
//     store, those survive a restart
// What this limiter uniquely stops is a spray across many accounts from one IP; 60/15min still
// bounds that to 4/min against a uniform 401 with ~40ms of argon2 per attempt.
export const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
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

// Per IP+token. The pending token is 1:1 with an account and unguessable, so it scopes the limit
// as tightly as an email would without letting the endpoint be used to probe whether an address
// is registered. Stacked under authLimiter (per-IP), which caps someone registering many accounts
// to farm a fresh bucket each.
//
// This is only the outer guard — the real defence against a 10^6 code space is the per-code
// 5-attempt cap plus the resend cap, both DB-backed so they survive a restart. MemoryStore does not.
const verifyKey = (req) => `${ipKey(req.ip)}|${String(req.body?.token ?? '').slice(0, 64)}`;

export const verifyLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many verification attempts. Please try again later.',
  keyGenerator: verifyKey,
});

export const resendLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 12,
  message: 'Too many codes requested. Please try again later.',
  keyGenerator: verifyKey,
});

/**
 * Per USER, not per IP — the only limiter here keyed on identity rather than address.
 *
 * POST /api/assets sits behind requireAuth, so an account always exists to key on, and keying on
 * IP would repeat the mistake that forced authLimiter from 20 to 60: behind NAT one abusive user
 * would exhaust the bucket for an entire office or mobile carrier. Abuse here already costs an
 * account, and account creation costs email verification plus authLimiter.
 *
 * 30/hour: each upload is a sharp decode and re-encode, so the ceiling is roughly
 * 30 x ~200ms = ~6s of CPU per user per hour, while someone genuinely decorating kits uploads a
 * handful. Generous for real use, bounded for abuse.
 *
 * Throwing on a missing req.user is the point, not paranoia. express-rate-limit would otherwise
 * key every request on the string 'undefined', quietly collapsing every user into ONE shared
 * bucket — a limiter that still looks present in the chain while protecting nothing. If this ever
 * fires, the middleware order is wrong: it must come after requireAuth.
 */
const userKey = (req) => {
  if (!req.user?.id) {
    throw new Error('assetLimiter requires req.user — mount it after requireAuth.');
  }
  return `user:${req.user.id}`;
};

export const assetLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Too many uploads. Please try again later.',
  keyGenerator: userKey,
});
