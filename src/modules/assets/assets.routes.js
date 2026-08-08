import express, { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { requireAuth } from '../../middlewares/requireAuth.js';
import { assetLimiter } from '../../middlewares/rateLimiters.js';
import { uploadLogoSchema } from './assets.schema.js';
import { uploadLogo } from './assets.controller.js';

const router = Router();

/**
 * POST /api/assets — upload a logo, receive `{ url, bytes }`.
 *
 * CHAIN ORDER IS LOAD-BEARING. requireAuth runs FIRST, before the 6mb body parser, which is the
 * opposite of /orders. It can: authentication reads only the Authorization header, so an
 * anonymous caller is rejected having cost us nothing, and the server never buffers 6MB for a
 * request it was always going to refuse. /orders cannot do this — checkout is open to guests, so
 * it must parse before it knows anything about the caller.
 *
 * assetLimiter is next because it keys on req.user.id, which requireAuth has just set. Mounting
 * it any earlier makes every user share one bucket (see its comment).
 *
 * The 6mb parser is scoped to this route, exactly as on /orders. The global cap stays 100kb
 * (CLAUDE.md rule 10) — only routes that genuinely carry an inline image pay for a large body.
 *
 * No anonymous upload surface exists by design: this endpoint writes files to disk, so an
 * unauthenticated version would be free, unattributable storage for anyone on the internet.
 */
router.post(
  '/',
  requireAuth,
  assetLimiter,
  express.json({ limit: '6mb' }),
  validate(uploadLogoSchema),
  uploadLogo,
);

export default router;
