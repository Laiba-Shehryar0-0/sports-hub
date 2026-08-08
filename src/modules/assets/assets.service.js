import { randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';

/**
 * Turns a client-supplied image into a stored file and a URL.
 *
 * Every rule in .claude/rules/backend-security.md §"Images and data URLs" lives here, in one
 * auditable place, so anything that accepts an image gets the same treatment.
 */

// From config, not from this file's __dirname. app.js derives the serve path from the same
// config, so the two can no longer drift apart.
const LOGO_DIR = env.LOGO_DIR;
const PUBLIC_PREFIX = '/static/logos';

/**
 * TEST-MODE WRITE GUARD — throws at import, before a single file can be written.
 *
 * Deliberately stronger than the database guard. That one lives in the test files themselves
 * (`expect(env.DB_NAME).toBe('kitworld_test')`), so it only protects suites that remember to
 * assert it. This sits in the code path, so it protects every caller — tests, scripts, ad-hoc
 * probes — including ones written later by someone who never reads this comment.
 *
 * It checks CONTAINMENT IN AN OS TEMP DIRECTORY, not "differs from the production path". A
 * difference check passes for any other real directory a typo could produce; only containment
 * establishes that the target is actually scratch space.
 */
function assertTempDirUnderTest(dir) {
  // Both forms of the temp root: on Windows os.tmpdir() can differ from its realpath (8.3 name or
  // a junction). dir itself cannot be realpath'd — it may not exist yet.
  const roots = [...new Set([os.tmpdir(), realpathSync(os.tmpdir())])].map((p) => path.resolve(p));
  const target = path.resolve(dir);

  const inside = roots.some((root) => {
    const relative = path.relative(root, target);
    // relative === '' rejects the temp root itself: a subdirectory is required, so the mkdir below
    // and any future cleanup have a bounded scope rather than the whole of /tmp.
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  });

  if (!inside) {
    throw new Error(
      `NODE_ENV=test but LOGO_DIR (${target}) is not inside the OS temp directory `
      + `(${os.tmpdir()}). Refusing to write uploads to real storage.`,
    );
  }
}

/**
 * Both checks below run AT IMPORT, and deliberately so. Do not make them lazy.
 *
 * This module is imported by orders.service, so a bad LOGO_DIR now stops the process from
 * starting rather than degrading. That is the right trade: an order that begins, collects a
 * customer's name, address and phone, and only then fails on the logo write is strictly worse
 * than a server that refuses to boot — the customer has handed over their details and lost their
 * design, and the operator finds out from them rather than from the deploy. A process that will
 * not start is noticed immediately, by the person who caused it.
 *
 * This is the contract env.js already has: invalid configuration exits at boot, it does not wait
 * to fail on the first request that happens to touch it. Deferring either check to first write
 * would quietly break that.
 */
if (env.isTest) assertTempDirUnderTest(LOGO_DIR);

// Created here, not at first upload — an unwritable LOGO_DIR (EACCES, ENOTDIR, a missing parent
// on a volume that never mounted) must surface at boot, not as a 500 for whichever user uploads
// first, possibly days after the deploy that broke it.
mkdirSync(LOGO_DIR, { recursive: true });

// Raster formats only. SVG is deliberately absent: it is XML, it can carry <script> and external
// entity references, and browsers execute it when served inline.
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

// 8MB of base64 is roughly 6MB decoded — matches the /orders body limit and CLAUDE.md rule 9.
const MAX_DATA_URL_CHARS = 8_000_000;
const MAX_DECODED_BYTES = 6 * 1024 * 1024;

// Caps the output so a legitimately huge upload can't bloat storage or the order page.
const MAX_DIMENSION = 1024;

// Guards against decompression bombs: a small file that expands to gigapixels. sharp would
// otherwise happily allocate for it before we ever see the dimensions.
const LIMIT_INPUT_PIXELS = 40_000_000;

const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

function rejectImage(message, code, details) {
  return new AppError(message, { statusCode: 422, code, details });
}

/**
 * Decodes, validates and re-encodes a data URL, returning a root-relative URL.
 *
 * Root-relative, never absolute: baking localhost:4000 (or any host) into a stored URL breaks
 * every row the moment the deploy host changes — the same reason kits.image_url is relative.
 */
export async function storeFromDataUrl(dataUrl, { ownerUserId = null } = {}) {
  if (typeof dataUrl !== 'string' || dataUrl.length > MAX_DATA_URL_CHARS) {
    throw rejectImage('That logo is too large.', 'ASSET_TOO_LARGE');
  }

  // The prefix is a cheap shape check only — it is client-supplied and proves nothing. The real
  // check is the magic-byte sniff below.
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) {
    throw rejectImage('That logo is not a supported image.', 'ASSET_INVALID_DATA_URL');
  }

  let buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch {
    throw rejectImage('That logo could not be read.', 'ASSET_INVALID_DATA_URL');
  }
  if (buffer.length === 0 || buffer.length > MAX_DECODED_BYTES) {
    throw rejectImage('That logo is too large.', 'ASSET_TOO_LARGE');
  }

  // MAGIC BYTES, not the data-URL prefix and not any client-supplied mimetype. A file claiming
  // image/png in its prefix while actually being an SVG, an HTML document or a zip is exactly
  // what this catches.
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    throw rejectImage('Logos must be a JPEG, PNG or WebP image.', 'ASSET_UNSUPPORTED_TYPE', {
      detected: detected?.mime ?? 'unknown',
    });
  }

  // Re-encode rather than storing the original bytes. This is what strips EXIF/GPS and destroys
  // any payload smuggled in a metadata segment — the output is pixels sharp produced, not
  // anything the client sent. .rotate() first so EXIF orientation survives being stripped.
  let output;
  try {
    output = await sharp(buffer, { limitInputPixels: LIMIT_INPUT_PIXELS })
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  } catch (err) {
    // A buffer that passed the magic-byte check but won't decode is malformed or hostile.
    logger.warn({ err, ownerUserId }, 'Logo failed to re-encode');
    throw rejectImage('That logo could not be processed.', 'ASSET_UNPROCESSABLE');
  }

  // UUID key. No part of any client-supplied filename ever reaches a path (rule 5).
  const filename = `${randomUUID()}.webp`;
  // Redundant with the mkdirSync at import — kept as cheap insurance against the directory being
  // removed while the process is running, which the import-time call cannot cover.
  await mkdir(LOGO_DIR, { recursive: true });

  // File first, then the caller writes the DB row. A row pointing at a missing file is worse
  // than an orphaned file, which is merely garbage to collect.
  await writeFile(path.join(LOGO_DIR, filename), output);

  logger.info({ ownerUserId, bytes: output.length }, 'Logo stored');
  return { url: `${PUBLIC_PREFIX}/${filename}`, bytes: output.length };
}

/** True for a value that looks like an inline image the caller should hand to storeFromDataUrl. */
export function isImageDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}
