import { asyncHandler } from '../../utils/asyncHandler.js';
import * as ordersService from './orders.service.js';
import { idempotencyKeySchema } from './orders.schema.js';

export const createOrder = asyncHandler(async (req, res) => {
  // A malformed header is ignored rather than rejected: it only weakens double-submit
  // protection, and failing the order over it would be worse than the problem.
  const parsed = idempotencyKeySchema.safeParse(req.get('idempotency-key') || undefined);
  const idempotencyKey = parsed.success ? parsed.data ?? null : null;

  const { order } = await ordersService.placeOrder({
    body: req.body,
    userId: req.user?.id ?? null, // null = guest checkout
    idempotencyKey,
    ip: req.ip,
  });

  // 201 for both a new order and an idempotent replay: the client asked for an order to exist
  // and it does. Returning 200 on replay would make a retried request look different from the
  // original for no benefit to the caller.
  res.status(201).json(order);
});
