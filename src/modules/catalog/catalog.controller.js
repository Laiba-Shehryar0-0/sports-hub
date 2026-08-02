import { asyncHandler } from '../../utils/asyncHandler.js';
import * as catalogService from './catalog.service.js';

// No Cache-Control: a time-based freshness window is premature for three
// small, locally-served responses, and it hides DB changes from the browser
// for the whole window during development. Express still sends a weak ETag
// on every response by default, so a client that revalidates (If-None-Match)
// gets a cheap 304 when the data hasn't changed — no code needed for that.

export const getKits = asyncHandler(async (req, res) => {
  const kits = await catalogService.getKits();
  res.json(kits);
});

export const getProducts = asyncHandler(async (req, res) => {
  const products = await catalogService.getProducts();
  res.json(products);
});

export const getFeaturedKits = asyncHandler(async (req, res) => {
  const featured = await catalogService.getFeaturedKits();
  res.json(featured);
});
