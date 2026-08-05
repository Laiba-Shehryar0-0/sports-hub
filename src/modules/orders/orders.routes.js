import { Router } from 'express';
import express from 'express';
import { validate } from '../../middlewares/validate.js';
import { optionalAuth } from '../../middlewares/optionalAuth.js';
import { orderLimiter } from '../../middlewares/rateLimiters.js';
import { createOrderSchema } from './orders.schema.js';
import { createOrder } from './orders.controller.js';

const router = Router();

/**
 * The 6mb body parser is mounted HERE, on this route only — the global cap in app.js stays at
 * 100kb (CLAUDE.md rule 10). A global 6mb would make every endpoint a memory-exhaustion target;
 * route-scoped means only the one that genuinely carries an inline logo takes the risk.
 *
 * Order of the chain: parse the large body first (the limiter and validator both need it), then
 * rate-limit, then identify the user, then validate. optionalAuth never rejects, so an expired
 * token degrades to guest checkout rather than losing the order.
 */
router.post(
  '/',
  express.json({ limit: '6mb' }),
  orderLimiter,
  optionalAuth,
  validate(createOrderSchema),
  createOrder,
);

export default router;
