import { asyncHandler } from '../../utils/asyncHandler.js';
import * as assetsService from './assets.service.js';

/**
 * Unpack, delegate, respond. All the real work — magic-byte validation, the sharp re-encode that
 * strips EXIF, the UUID key — lives in the service and predates this endpoint.
 */
export const uploadLogo = asyncHandler(async (req, res) => {
  // ownerUserId comes from the verified token, never from the body. It is used only for the
  // audit log line; nothing about the stored file depends on it.
  const { url, bytes } = await assetsService.storeFromDataUrl(req.body.dataUrl, {
    ownerUserId: req.user.id,
  });

  // 201: a new resource exists at `url`. Uploading the same image twice deliberately produces two
  // files — deduplication happens on the cart item (design hash + size), not on the bytes, so an
  // identical logo on two different designs stays two independent files that can be replaced
  // separately.
  res.status(201).json({ url, bytes });
});
