import { pool } from '../../db/pool.js';

const CATALOG_COLUMNS = 'id, slug, name, sport, emoji, image_url, description, color';
const FEATURED_COLUMNS = `${CATALOG_COLUMNS}, featured_tag, accent, tag_bg, hover_rgb`;

// Serves GET /kits and GET /products (same rows, two mappers below).
// Serves GET /kits/featured with is_featured flipped.
// Both use idx_kits_featured (is_featured, sort_order) — is_featured is the
// leading column and matches the WHERE, sort_order is the next column and
// matches the ORDER BY, so rows come back pre-sorted with no filesort.
// is_active isn't in this index; it's applied as a cheap post-filter on the
// already-narrow (is_featured-scoped) row set.
async function selectRows(columns, isFeatured, db) {
  const [rows] = await db.query(
    `SELECT ${columns} FROM kits WHERE is_featured = ? AND is_active = 1 ORDER BY sort_order`,
    [isFeatured],
  );
  return rows;
}

function toKit(row) {
  return {
    id: row.id,
    slug: row.slug,
    emoji: row.emoji,
    image: row.image_url,
    name: row.name,
    sport: row.sport,
    desc: row.description,
    color: row.color,
  };
}

function toProduct(row) {
  return {
    id: row.id,
    image: row.image_url,
    name: row.name,
    cat: row.sport,
    color: row.color,
  };
}

function toFeaturedKit(row) {
  return {
    id: row.id,
    image: row.image_url,
    emoji: row.emoji,
    tag: row.featured_tag,
    sport: row.sport,
    title: row.name,
    desc: row.description,
    color: row.color,
    accent: row.accent,
    tagBg: row.tag_bg,
    hoverRgb: row.hover_rgb,
  };
}

export async function listKits(db = pool) {
  const rows = await selectRows(CATALOG_COLUMNS, 0, db);
  return rows.map(toKit);
}

export async function listProducts(db = pool) {
  const rows = await selectRows(CATALOG_COLUMNS, 0, db);
  return rows.map(toProduct);
}

export async function listFeaturedKits(db = pool) {
  const rows = await selectRows(FEATURED_COLUMNS, 1, db);
  return rows.map(toFeaturedKit);
}
