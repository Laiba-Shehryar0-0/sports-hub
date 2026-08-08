import { z } from 'zod';
import { MAX_DATA_URL_CHARS, DATA_URL_PREFIX_RE } from './assets.constants.js';

/**
 * POST /api/assets — upload one logo, get back a URL.
 *
 * .strict() so an unknown key is rejected rather than ignored (CLAUDE.md rule 7). There is exactly
 * one field: nothing about the stored file is the client's to choose. No filename (rule 5 — the
 * key is a generated UUID), no mimetype (rule 4 — decided by magic bytes), no dimensions, no
 * ownerUserId (taken from the verified token, never the body).
 */
export const uploadLogoSchema = z.object({
  // Bounded before anything decodes it: an unbounded string here is a memory-exhaustion primitive
  // even with the 6mb body cap, since base64 inflates on decode.
  dataUrl: z.string()
    .max(MAX_DATA_URL_CHARS, 'That logo is too large.')
    .regex(DATA_URL_PREFIX_RE, 'Logos must be a JPEG, PNG or WebP data URL.'),
}).strict();
