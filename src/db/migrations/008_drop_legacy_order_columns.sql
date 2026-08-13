-- Phase 5: drop the three single-design columns from `orders`.
--
-- Migration 007 moved orders to a header/lines model and made these nullable; 008 removes them.
-- Since Phase 5 the API accepts only the `items[]` payload, so nothing writes them, and every
-- order's design, size and unit price live on `order_items` — one row per line.
--
-- ┌─ THE CODE CHANGE MUST LAND WITH THIS FILE, NOT AFTER IT ─────────────────────────────────────┐
-- │ orders.repository.js selected `unit_price` and `primary_size` through ORDER_SUMMARY_COLUMNS, │
-- │ which serves findByIdempotencyKey — the double-click path. Selecting a dropped column is an   │
-- │ ER_BAD_FIELD_ERROR, so applying this against the previous revision of that file turns every   │
-- │ idempotent replay into a 500. They were changed in the same commit.                           │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- IRREVERSIBLE, and deliberately so — this is the only statement in the project that destroys
-- customer data rather than moving it. Verified before writing, on kitworld AND kitworld_test:
--
--   SELECT o.id, o.reference FROM orders o
--   LEFT JOIN order_items oi ON oi.order_id = o.id
--   WHERE o.design_json IS NOT NULL AND oi.id IS NULL;
--
-- 0 rows on both. kitworld: 2 orders, 1 carrying design_json (KW-2026-000002, backfilled by 007),
-- 6 order_items rows. So no design exists only in this column. Run that query again before
-- applying to any database this has not already run against — a production copy will have orders
-- neither of those two had.
--
-- No IF EXISTS guard: MySQL 8 has no DROP COLUMN IF EXISTS, and it would buy nothing. migrate.js
-- records applied filenames in schema_migrations and skips them, so re-running is already a no-op.
-- Note also that MySQL commits DDL implicitly — migrate.js wraps each file in a transaction, but
-- that rollback cannot undo this statement. There is no down migration.

ALTER TABLE orders
  DROP COLUMN design_json,
  DROP COLUMN unit_price,
  DROP COLUMN primary_size;
