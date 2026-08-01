import rateLimit from 'express-rate-limit';

function makeLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
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

// Login/register brute-force protection.
export const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts. Please try again later.',
});
