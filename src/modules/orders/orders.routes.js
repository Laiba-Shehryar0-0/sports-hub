import { Router } from 'express';
import express from 'express';
import { validate } from '../../middlewares/validate.js';
import { optionalAuth } from '../../middlewares/optionalAuth.js';
import { requireAuth } from '../../middlewares/requireAuth.js';
import { orderLimiter, quoteLimiter } from '../../middlewares/rateLimiters.js';
import {
  createOrderSchema, quoteSchema, referenceParamSchema, listOrdersQuerySchema, emptyQuerySchema,
} from './orders.schema.js';
import {
  createOrder, quoteOrder, getOrder, listOrders,
} from './orders.controller.js';

const router = Router();

/**
 * POST /api/orders/quote — price a cart, create nothing.
 *
 * requireAuth, unlike POST / below: Add to Cart is gated, so a cart only exists for a signed-in
 * user and there is no anonymous caller to serve. It also runs BEFORE the body parser, so an
 * unauthenticated request is refused without the server buffering 6mb — the same ordering as
 * /api/assets. POST / cannot do that, because guests must be able to check out.
 *
 * quoteLimiter keys on req.user.id, so it must follow requireAuth.
 */
router.post(
  '/quote',
  requireAuth,
  quoteLimiter,
  express.json({ limit: '6mb' }),
  validate(quoteSchema),
  quoteOrder,
);

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

/**
 * GET /orders (mine) and GET /orders/:reference — order history. Both requireAuth: there is no
 * guest concept for "my orders" the way there is for placing one, and ownership is what scopes
 * every row either endpoint can return.
 *
 * No route-specific rate limiter, unlike POST / and POST /quote — those are abuse/spam surfaces
 * because /orders accepts unauthenticated traffic; these two run only for an identified user
 * behind requireAuth, same posture as GET /auth/me.
 */
router.get('/', requireAuth, validate(listOrdersQuerySchema, 'query'), listOrders);
router.get(
  '/:reference',
  requireAuth,
  validate(referenceParamSchema, 'params'),
  validate(emptyQuerySchema, 'query'),
  getOrder,
);

export default router;
