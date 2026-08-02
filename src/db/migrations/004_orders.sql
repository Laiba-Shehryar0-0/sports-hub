-- Server-computed pricing snapshot lives in real columns, never trusted from
-- the client (CLAUDE.md rule 2). design_json/contact_json/address_json stay
-- as JSON since they're not WHERE/SUM targets themselves.

CREATE TABLE orders (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reference      VARCHAR(30) NOT NULL,          -- 'KW-2026-000044', shown to the user
  user_id        BIGINT UNSIGNED NULL,          -- NULL = guest checkout
  design_json    JSON NOT NULL,
  contact_json   JSON NOT NULL,
  address_json   JSON NOT NULL,
  delivery_id    VARCHAR(40) NOT NULL,
  payment_id     ENUM('card','bank','cod') NOT NULL,
  total_kits     INT UNSIGNED NOT NULL,
  primary_size   VARCHAR(20) NOT NULL,
  instructions   TEXT NULL,
  -- Server-computed pricing snapshot — the client's numbers are never stored.
  unit_price     INT UNSIGNED NOT NULL,           -- whole PKR, no minor units
  kit_price      INT UNSIGNED NOT NULL,           -- whole PKR, no minor units
  delivery_price INT UNSIGNED NOT NULL,           -- whole PKR, no minor units
  discount       INT UNSIGNED NOT NULL DEFAULT 0, -- whole PKR, no minor units; always 0 until promo codes are in scope
  total_price    INT UNSIGNED NOT NULL,           -- whole PKR, no minor units
  status         ENUM('placed','confirmed','in_production','shipped','delivered','cancelled')
                 NOT NULL DEFAULT 'placed',
  idempotency_key CHAR(36) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Serves GET /orders/:reference (ownership still checked in the WHERE
  -- clause at the repository layer per CLAUDE.md rule 6).
  UNIQUE KEY uq_order_ref (reference),
  -- Serves the double-submit guard (CLAUDE.md rule 11): the second insert
  -- with the same key fails ER_DUP_ENTRY and the existing order is returned.
  UNIQUE KEY uq_order_idem (idempotency_key),
  -- Serves GET /orders (mine): WHERE user_id = ? ORDER BY created_at DESC,
  -- no filesort (BTREE scanned backwards).
  KEY idx_order_user (user_id, created_at),
  -- No index on `status` or on contact_json's email: no endpoint filters by
  -- status or looks an order up by guest email today. Add both in a later
  -- migration if/when an admin view or guest-lookup endpoint lands.
  CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
