-- 'Card' is removed as a payment option: no real payment gateway exists behind it (the checkout
-- form only validated card number/expiry/CVV format client-side — never charged anything, never
-- even sent the card fields to this API), so offering it implied a payment collection that never
-- happened. Only 'bank' (manually reconciled) and 'cod' remain, both of which are real.
--
-- Verified before writing, on kitworld:
--   SELECT id, reference, payment_id FROM orders WHERE payment_id = 'card';
-- 2 rows (KW-2026-000003, KW-2026-000004) — both dev-only orders created while verifying the
-- card validation UI in this same session, not real customer orders. Deleted (order_items first,
-- FK is ON DELETE RESTRICT) before writing this file, so the ENUM narrows cleanly. Re-run that
-- query before applying this to any database that has not already had it run against — a
-- database with a real 'card' order would need those orders migrated to a real payment method
-- first, not silently truncated by this ALTER.
--
-- kitworld_test is schema-only (seeded fresh per test run), so it never had this problem.

ALTER TABLE orders
  MODIFY payment_id ENUM('bank','cod') NOT NULL;
