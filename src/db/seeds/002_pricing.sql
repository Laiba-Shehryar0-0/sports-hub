-- kit_prices and delivery_methods, verbatim from BASE_PRICES / DELIVERY_METHODS
-- in docs/frontend-reference/kitShapes.js. Must match the customizer's own
-- checkout arithmetic exactly, or every order logs a price_mismatch warning.
-- ON DUPLICATE KEY UPDATE makes re-running this file safe.

INSERT INTO kit_prices (kit_type, kit_label, unit_price, is_active) VALUES
  ('jersey', 'Jersey', 2800, 1),
  ('polo',   'Polo',   2600, 1),
  ('jumper', 'Jumper', 3200, 1),
  ('shorts', 'Shorts', 1500, 1),
  ('socks',  'Socks',  600,  1),
  ('cap',    'Cap',    1200, 1)
AS new
ON DUPLICATE KEY UPDATE
  kit_label = new.kit_label,
  unit_price = new.unit_price,
  is_active = new.is_active;

INSERT INTO delivery_methods (id, name, price, eta_days, is_active) VALUES
  ('standard',      'Standard Delivery',      0,    '10–14 business days', 1),
  ('express',       'Express Delivery',       500,  '5–7 business days',   1),
  ('rush',          'Rush Order',             1200, '2–3 business days',   1),
  ('international', 'International Shipping', 3500, '12–20 business days', 1)
AS new
ON DUPLICATE KEY UPDATE
  name = new.name,
  price = new.price,
  eta_days = new.eta_days,
  is_active = new.is_active;
