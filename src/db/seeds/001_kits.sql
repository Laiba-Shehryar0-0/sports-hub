-- 20 catalog kits verbatim from docs/frontend-reference/kitsSeed.js (KITS_SEED),
-- plus 4 featured-only rows from featuredKitsSeed.js (FEATURED_KITS_SEED) —
-- the featured entries have their own title/color/accent/tagBg/hoverRgb that
-- don't match any catalog row, so they're inserted as 4 additional rows, not
-- flags on existing ones. `image_url` is root-relative (/static/kits/<file>),
-- served by express.static from public/static/kits — never an absolute URL
-- with a host, or every row breaks the moment the deploy host changes.
--
-- THIS FILE IS AUTHORITATIVE. Deleting a product from the VALUES list below
-- deactivates it in the database on the next `npm run seed`. The upsert alone
-- could only add and update, so a removed product used to live on in the
-- catalog forever and had to be deleted by hand.
--
-- The rows are staged in a TEMPORARY table so the slug list exists exactly ONCE
-- and both statements below derive from it. The alternative — repeating all 24
-- slugs in a `NOT IN (...)` after the insert — has a nasty failure mode: adding
-- a product to VALUES but not to the second list deactivates it the instant it
-- is inserted, so it looks like the seed mysteriously ignored it. Deriving both
-- statements from one source makes that drift impossible rather than merely
-- documented.
--
-- Requires CREATE TEMPORARY TABLES for the app DB user. Temp tables are
-- session-scoped and cannot create or alter real schema, so this does not widen
-- the account beyond its DML-only intent.

DROP TEMPORARY TABLE IF EXISTS seed_kits;

CREATE TEMPORARY TABLE seed_kits (
  slug         VARCHAR(80)  NOT NULL PRIMARY KEY,
  name         VARCHAR(120) NOT NULL,
  -- VARCHAR rather than repeating the ENUM from 002_catalog.sql: the enum stays
  -- defined in one place, and a bad sport value fails loudly on the INSERT INTO
  -- kits below instead of being silently accepted against a stale copy.
  sport        VARCHAR(40)  NOT NULL,
  emoji        VARCHAR(8)   NULL,
  image_url    VARCHAR(500) NULL,
  description  TEXT         NULL,
  color        CHAR(7)      NULL,
  is_featured  TINYINT(1)   NOT NULL DEFAULT 0,
  featured_tag VARCHAR(40)  NULL,
  accent       CHAR(7)      NULL,
  tag_bg       CHAR(7)      NULL,
  hover_rgb    VARCHAR(20)  NULL,
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO seed_kits
  (slug, name, sport, emoji, image_url, description, color, is_featured, featured_tag, accent, tag_bg, hover_rgb, sort_order, is_active)
VALUES
  ('cricket-shirt', 'Cricket Shirt', 'cricket', '🏏', '/static/kits/cricket-shirt-front.png', 'Premium cotton-poly blend cricket shirt with classic fit.', '#1a3a1a', 0, NULL, NULL, NULL, NULL, 1, 1),
  ('cricket-trousers', 'Cricket Trousers', 'cricket', '🏏', '/static/kits/cricket-trousers-front.png', 'Full-length cricket trousers with reinforced knees.', '#7a5800', 0, NULL, NULL, NULL, NULL, 2, 1),
  ('cricket-sweater', 'Cricket Sweater', 'cricket', '🏏', '/static/kits/cricket-sweater-front.png', 'V-neck wool cricket sweater with team colors.', '#4a0010', 0, NULL, NULL, NULL, NULL, 3, 1),
  ('football-jersey', 'Football Jersey', 'football', '⚽', '/static/kits/football-jersey-front.png', 'Lightweight moisture-wicking football jersey.', '#7a3a00', 0, NULL, NULL, NULL, NULL, 4, 1),
  ('football-shorts', 'Football Shorts', 'football', '⚽', '/static/kits/football-shorts-front.png', 'Elasticated football shorts with side pockets.', '#0a1a3a', 0, NULL, NULL, NULL, NULL, 5, 1),
  ('goalkeeper-kit', 'Goalkeeper Shirt', 'football', '⚽', '/static/kits/goalkeeperkit-front.png', 'High-visibility goalkeeper jersey with padded elbows.', '#2a1a0a', 0, NULL, NULL, NULL, NULL, 6, 1),
  ('basketball-jersey', 'Basketball Jersey', 'basketball', '🏀', '/static/kits/basketball-jersey-front.png', 'Mesh-panelled basketball jersey for maximum breathability.', '#0a1a3a', 0, NULL, NULL, NULL, NULL, 7, 1),
  ('basketball-shorts', 'Basketball Shorts', 'basketball', '🏀', '/static/kits/basketball-shorts-front.png', 'Loose-fit basketball shorts with drawstring.', '#1a3a1a', 0, NULL, NULL, NULL, NULL, 8, 1),
  ('training-tshirt', 'Training T-Shirt', 'training', '💪', '/static/kits/training-T-shit-front.png', 'Comfortable training tee in moisture-wicking fabric.', '#4a0010', 0, NULL, NULL, NULL, NULL, 9, 1),
  ('basketball-headband', 'Basketball Headband', 'basketball', '🎗️', '/static/kits/basketball-headband.png', 'Sweat-wicking headband to keep you focused on the game.', '#4a0010', 0, NULL, NULL, NULL, NULL, 10, 1),
  ('training-shorts', 'Training Shorts', 'training', '🩳', '/static/kits/training-shorts-front.png', 'Lightweight training shorts with reflective trim.', '#2a2a2a', 0, NULL, NULL, NULL, NULL, 11, 1),
  ('training-vest', 'Training Vest', 'training', '🦺', '/static/kits/training-vest-front.png', 'Mesh training vest for team practice drills.', '#3a2a1a', 0, NULL, NULL, NULL, NULL, 12, 1),
  ('cricket-cap', 'Cricket Cap', 'cricket', '🧢', '/static/kits/cricket-cap.png', 'Classic cricket cap with adjustable fit.', '#1a3a1a', 0, NULL, NULL, NULL, NULL, 13, 1),
  ('training-bib', 'Training Bib', 'football', '🎽', '/static/kits/training-bib-front.png', 'Lightweight mesh training bib for team drills.', '#0a1a3a', 0, NULL, NULL, NULL, NULL, 14, 1),
  ('warmup-suit', 'Warm-up Suit', 'basketball', '🧥', '/static/kits/warmup-suit-front.png', 'Full-body warm-up suit for pre-game preparation.', '#7a3a00', 0, NULL, NULL, NULL, NULL, 15, 1),
  ('tracksuit', 'Tracksuit', 'training', '👟', '/static/kits/tracksuit-front.png', 'Comfortable full-body tracksuit for training sessions.', '#2a0a4a', 0, NULL, NULL, NULL, NULL, 16, 1),
  ('team-socks', 'Team Socks', 'others', '🧦', '/static/kits/team-socks.png', 'Knee-high team socks in matching club colours, cushioned sole and ribbed cuff.', '#0a3a1a', 0, NULL, NULL, NULL, NULL, 17, 1),
  ('hockey-kit', 'Hockey Shirt', 'others', '🏑', '/static/kits/hockey-kit-front.png', 'Durable hockey shirt built for field play.', '#4a0010', 0, NULL, NULL, NULL, NULL, 18, 1),
  ('cycling-kit', 'Cycling Shirt', 'others', '🚴', '/static/kits/cycling-kit-front.png', 'Aerodynamic close-fit cycling shirt with a full-length zip.', '#0a1a3a', 0, NULL, NULL, NULL, NULL, 19, 1),
  ('rugby-kit', 'Rugby Shirt', 'others', '🏉', '/static/kits/rugby-kit-front.png', 'Heavy-duty rugby jersey built for contact sport.', '#3a1a0a', 0, NULL, NULL, NULL, NULL, 20, 1),
  -- Featured-only rows (FEATURED_KITS_SEED). Slugs (`featured-*-kit`) are
  -- invented — the source has no slug field for these.
  ('featured-cricket-kit', 'Cricket Kit', 'cricket', '🏏', '/static/kits/cricket.jfif', 'Premium uniform with professional cut and breathable fabric.', '#8B6914', 1, 'Featured', '#F5A623', '#3d3000', '138, 112, 0', 21, 1),
  ('featured-football-kit', 'Football Kit', 'football', '⚽', '/static/kits/football.jpg', 'Professional football jersey with moisture-wicking technology.', '#1a4a1a', 1, 'Featured', '#4CAF50', '#0a2a0a', '26, 92, 26', 22, 1),
  ('featured-basketball-kit', 'Basketball Kit', 'basketball', '🏀', '/static/kits/basketball.jfif', 'High-performance basketball uniform with enhanced mobility.', '#1a2a4a', 1, 'Featured', '#2196F3', '#040f30', '10, 42, 106', 23, 1),
  ('featured-training-kit', 'Training Kit', 'training', '💪', '/static/kits/training.jfif', 'Comfortable training wear perfect for practice sessions.', '#2a1a2a', 1, 'Featured', '#9C27B0', '#20003a', '74, 10, 106', 24, 1);

-- Upsert keyed on uq_kits_slug. is_active comes from the staged row, so a
-- product that was previously retired is reactivated automatically just by
-- being added back to the list above.
INSERT INTO kits
  (slug, name, sport, emoji, image_url, description, color, is_featured, featured_tag, accent, tag_bg, hover_rgb, sort_order, is_active)
SELECT
  slug, name, sport, emoji, image_url, description, color, is_featured, featured_tag, accent, tag_bg, hover_rgb, sort_order, is_active
FROM seed_kits AS src
ON DUPLICATE KEY UPDATE
  name = src.name,
  sport = src.sport,
  emoji = src.emoji,
  image_url = src.image_url,
  description = src.description,
  color = src.color,
  is_featured = src.is_featured,
  featured_tag = src.featured_tag,
  accent = src.accent,
  tag_bg = src.tag_bg,
  hover_rgb = src.hover_rgb,
  sort_order = src.sort_order,
  is_active = src.is_active;

-- Retire anything the seed no longer lists.
--
-- Deactivate, never DELETE: an order's design_json can name a kit by slug, and
-- destroying the row would strand that history. All three catalog projections
-- already filter on is_active = 1, so a retired product disappears from /kits,
-- /products and /kits/featured with no code change.
--
-- Scoped explicitly per CLAUDE.md rule 16 — the WHERE names the exact rows via
-- the staged set and skips rows already inactive, so a re-run is a no-op rather
-- than a repeated write. It runs AFTER the insert on purpose: if the insert
-- fails, nothing has been deactivated and the catalog is left untouched.
UPDATE kits
SET is_active = 0
WHERE is_active = 1
  AND slug NOT IN (SELECT slug FROM seed_kits);

DROP TEMPORARY TABLE seed_kits;
