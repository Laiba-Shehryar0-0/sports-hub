-- Server-side price tables — this is what makes it possible to ignore the
-- client-sent `pricing` object (CLAUDE.md rule 2 / docs/backend-plan.md §1.1).
-- kit_type is keyed alone, no `template` column: BASE_PRICES in kitShapes.js
-- has no per-template price variation (docs/frontend-reference/EXTRACTED.md).

CREATE TABLE kit_prices (
  id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kit_type    VARCHAR(40) NOT NULL,      -- 'jersey','polo','jumper','shorts','socks','cap'
  kit_label   VARCHAR(80) NOT NULL,      -- display lookup only, never priced on
  unit_price  INT UNSIGNED NOT NULL,     -- whole PKR, no minor units
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  -- Serves the one query that hits this table, once per order:
  -- SELECT unit_price, kit_label FROM kit_prices WHERE kit_type = ?.
  -- Also the data-integrity constraint: one active price per kit type.
  UNIQUE KEY uq_kit_price (kit_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE delivery_methods (
  id         VARCHAR(40) NOT NULL PRIMARY KEY,   -- 'standard','express','rush','international'
  name       VARCHAR(80) NOT NULL,
  price      INT UNSIGNED NOT NULL,              -- whole PKR, no minor units
  eta_days   VARCHAR(40) NULL,
  is_active  TINYINT(1) NOT NULL DEFAULT 1
  -- No secondary index: the natural PK (id) already covers the only lookup,
  -- SELECT name, price FROM delivery_methods WHERE id = ?, and the table
  -- only ever holds the 4 known methods.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
