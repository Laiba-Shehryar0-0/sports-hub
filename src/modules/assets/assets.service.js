import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';

/**
 * Turns a client-supplied image into a stored file and a URL.
 *
 * Every rule in .claude/rules/backend-security.md §"Images and data URLs" lives here, in one
 * auditable place, so anything that accepts an image gets the same treatment.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_DIR = path.join(__dirname, '..', '..', '..', 'public', 'static', 'logos');
const PUBLIC_PREFIX = '/static/logos';

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
