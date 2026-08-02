-- One table, three read projections: GET /kits, GET /products, GET /kits/featured.
-- Different mappers in the repository, not different tables (docs/backend-plan.md §3).
-- `sport` here is the 5-value catalog enum (cricket/football/basketball/training/others) —
-- NOT the 3-value design.sport enum used inside an order's design_json
-- (docs/frontend-reference/EXTRACTED.md: "Catalog sport enum" section).

CREATE TABLE kits (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug         VARCHAR(80)  NOT NULL,
  name         VARCHAR(120) NOT NULL,
  sport        ENUM('cricket','football','basketball','training','others') NOT NULL,
  emoji        VARCHAR(8)   NULL,
  image_url    VARCHAR(500) NULL,
  description  TEXT         NULL,
  color        CHAR(7)      NULL,
  -- Extra fields the /kits/featured projection needs.
  is_featured  TINYINT(1)   NOT NULL DEFAULT 0,
  featured_tag VARCHAR(40)  NULL,
  accent       CHAR(7)      NULL,
  tag_bg       CHAR(7)      NULL,
  hover_rgb    VARCHAR(20)  NULL,
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  -- Enforces one row per seed slug so re-running the seed script is idempotent
  -- (INSERT ... ON DUPLICATE KEY UPDATE keyed on slug). No endpoint looks a
  -- kit up by slug today — API_CONTRACT.md has no GET /kits/:slug.
  UNIQUE KEY uq_kits_slug (slug),
  -- Serves GET /kits and GET /products (same underlying query, different
  -- mapper): WHERE is_active = 1 [AND sport = ?] ORDER BY sort_order.
  -- The `sport` filter isn't confirmed by a documented query param in
  -- API_CONTRACT.md — flagged below as the speculative part of this index.
  KEY idx_kits_browse (is_active, sport, sort_order),
  -- Serves GET /kits/featured: WHERE is_featured = 1 ORDER BY sort_order.
  KEY idx_kits_featured (is_featured, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
