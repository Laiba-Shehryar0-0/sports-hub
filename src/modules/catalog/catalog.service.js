import * as catalogRepository from './catalog.repository.js';

export function getKits() {
  return catalogRepository.listKits();
}

export function getProducts() {
  return catalogRepository.listProducts();
}

export function getFeaturedKits() {
  return catalogRepository.listFeaturedKits();
}
