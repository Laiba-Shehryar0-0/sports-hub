-- Orders move from one-design-per-order to a header/lines model, so a cart of several designs can
-- be checked out as one order. `orders` stays the header (contact, address, delivery, money
-- totals); `order_items` holds one row per design.
--
-- Statement order is deliberate and must not be rearranged:
--   1. CREATE the table
--   2. BACKFILL existing orders, which reads orders.design_json / unit_price / primary_size while
--      they are still NOT NULL and still populated
--   3. ALTER those three columns to NULL
-- Backfilling after the ALTER would still work today, but doing it before keeps the read of
-- guaranteed-present columns adjacent to the constraint that guarantees them.

CREATE TABLE order_items (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id    BIGINT UNSIGNED NOT NULL,
  position    SMALLINT UNSIGNED NOT NULL,
  design_json JSON NOT NULL,
  -- Real columns, not JSON lookups: "how many polos did we sell" is a WHERE/SUM and must not have
  -- to dig into design_json (CLAUDE.md §Database).
  kit_type    VARCHAR(40) NOT NULL,
  -- Snapshot of the catalog label at purchase time. Free text by design, and deliberately NOT a
  -- foreign key: renaming a product later must not rewrite what a customer actually bought.
  kit_product VARCHAR(80) NULL,
  size        VARCHAR(20) NOT NULL,
  quantity    INT UNSIGNED NOT NULL,
  unit_price  INT UNSIGNED NOT NULL,   -- whole PKR, no minor units. Snapshot at purchase.
  line_total  INT UNSIGNED NOT NULL,   -- whole PKR, no minor units. = unit_price * quantity.
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- UNIQUE, not a plain KEY. Serves the only query this table has — fetch one order's lines in
  -- order — and simultaneously stops two lines sharing position 1, which would make render order
  -- nondeterministic. A plain index would allow the duplicate silently.
  UNIQUE KEY uq_order_items_position (order_id, position),

  -- RESTRICT, not CASCADE. An unscoped `DELETE FROM orders` must fail loudly rather than quietly
  -- taking every order line with it — the same failure class CLAUDE.md rule 16 exists for. Orders
  -- are financial records; deleting one should be a deliberate, scoped act that clears its lines
  -- first, not something a stray statement can do in one go.
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Backfill: every pre-existing order becomes exactly one line.
--
-- This is what lets order history render from order_items ALONE — with no "if the order has no
-- lines, fall back to the singular columns" branch. The service writes lines for every order from
-- here on, so after this statement no order in the database is without order_items. That branch
-- would otherwise exist for zero rows and live forever.
--
-- Verified against the live data before writing this:
--   * unit_price * total_kits = kit_price holds for every row (0 exceptions), so kit_price is a
--     safe line_total.
--   * `->>` on a JSON null returns the STRING 'null', not SQL NULL — confirmed against
--     design_json->>'$.logoPreset' on KW-2026-000002.
--
-- Both extracted fields are wrapped in NULLIF, for DIFFERENT reasons:
--   * kit_product is NULLable, so NULLIF turns a JSON null into a clean SQL NULL instead of the
--     literal text 'null'. (kitProduct is null whenever the user did not arrive from a catalog
--     card.)
--   * kit_type is NOT NULL, so NULLIF makes the migration FAIL LOUDLY on a design missing a
--     kitType, rather than succeeding and storing the string 'null' — a value that matches no row
--     in kit_prices and would silently 422 at pricing time forever after. It cannot trip on the
--     current dev row; it exists because this file also runs against kitworld_test and every
--     fresh setup.
--
-- Expected result for the one existing order, KW-2026-000002:
--   position 1, kit_type 'polo', kit_product 'Cricket Shirt', size 'M',
--   quantity 5, unit_price 2600, line_total 13000
INSERT INTO order_items
  (order_id, position, design_json, kit_type, kit_product, size, quantity, unit_price, line_total)
SELECT
  id,
  1,
  design_json,
  NULLIF(design_json->>'$.kitType', 'null'),
  NULLIF(design_json->>'$.kitProduct', 'null'),
  primary_size,
  total_kits,
  unit_price,
  kit_price
FROM orders
WHERE design_json IS NOT NULL;

-- A multi-item order has no single design, no single unit price and no single size, so these three
-- must become nullable. The remaining money columns stay NOT NULL because they are still
-- meaningful as cart-level aggregates: total_kits = SUM(quantity), kit_price = SUM(line_total),
-- and delivery_price / discount / total_price are per-order by definition.
ALTER TABLE orders
  MODIFY design_json  JSON         NULL,
  MODIFY unit_price   INT UNSIGNED NULL,
  MODIFY primary_size VARCHAR(20)  NULL;
