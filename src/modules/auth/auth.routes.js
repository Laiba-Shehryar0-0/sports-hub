import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { requireAuth } from '../../middlewares/requireAuth.js';
import { authLimiter, loginLimiter, verifyLimiter, resendLimiter } from '../../middlewares/rateLimiters.js';
import {
  registerSchema, loginSchema, verifySchema, resendSchema, emptyBodySchema, emptyQuerySchema,
} from './auth.schema.js';
import { register, login, verifyEmail, resendCode, me, logout } from './auth.controller.js';

const router = Router();

// Limiters go BEFORE validate, not after: an attacker sending deliberately malformed bodies would
// otherwise never be counted (validate throws first), leaving them only globalLimiter's 300/15min
// to hammer the endpoint. Counting first also means no CPU is spent before the limit applies.
//
// loginLimiter reads req.body.email, and express.json runs at app level (app.js:55) before any
// router — so the body is parsed by the time this runs.
router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, loginLimiter, validate(loginSchema), login);
router.post('/verify', authLimiter, verifyLimiter, validate(verifySchema), verifyEmail);
router.post('/resend', authLimiter, resendLimiter, validate(resendSchema), resendCode);
router.get('/me', requireAuth, validate(emptyQuerySchema, 'query'), me);
router.post('/logout', requireAuth, validate(emptyBodySchema), logout);

export default router;
