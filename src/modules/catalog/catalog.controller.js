import { asyncHandler } from '../../utils/asyncHandler.js';
import * as catalogService from './catalog.service.js';

const CACHE_CONTROL = 'public, max-age=300';

export const getKits = asyncHandler(async (req, res) => {
  const kits = await catalogService.getKits();
  res.set('Cache-Control', CACHE_CONTROL);
  res.json(kits);
});

export const getProducts = asyncHandler(async (req, res) => {
  const products = await catalogService.getProducts();
  res.set('Cache-Control', CACHE_CONTROL);
  res.json(products);
});

export const getFeaturedKits = asyncHandler(async (req, res) => {
  const featured = await catalogService.getFeaturedKits();
  res.set('Cache-Control', CACHE_CONTROL);
  res.json(featured);
});
