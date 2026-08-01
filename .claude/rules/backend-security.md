---
paths:
  - "src/modules/**/*.js"
  - "src/middlewares/**/*.js"
  - "src/db/**/*.js"
---

# Security rules for request-handling code

Loaded when working inside modules, middlewares, or db code.

## Pricing — the highest-risk path in this codebase

- `req.body.pricing` is accepted by the schema and then **discarded**. It is never read,
  never stored, never returned.
- Every figure (`unitPrice`, `kitPrice`, `deliveryPrice`, `discount`, `total`) is computed
  server-side from `kit_prices`, `delivery_methods`, and `promo_codes`.
- Log `{ event: 'price_mismatch', clientTotal, serverTotal, ip }` at warn level when the
  client's total differs. That single line is both the fraud signal and the stale-page signal.
- Promo codes are validated server-side: active, not expired, under `max_uses`, meets
  `min_total`. Never trust `promoApplied` from the request.
- Money arithmetic stays in integers (whole PKR). Never `parseFloat`, never `toFixed`.

## SQL

- `db.execute(sql, params)` with `?` placeholders. Values never appear in the SQL string.
- `IN (...)`: `db.query('... WHERE id IN (?)', [idsArray])` — cap the array length first.
- `ORDER BY` cannot be parameterized: map a zod enum through a fixed allowlist object.
- Never `SELECT *` on `orders` — it carries three JSON columns. Name the columns you need.
  List endpoints return metadata only, never `design_json`.
- Before adding a query with a new `WHERE` shape, say which index serves it.

## JSON columns

- mysql2 returns `JSON` columns as parsed objects. Never `JSON.parse` them.
- On write, `JSON.stringify`. Passing an object stores `"[object Object]"`.
- A JSON column has no constraints — everything inside it must be validated by zod first.

## Input

- Every route has `validate({ body, params, query })` with `.strict()` objects.
- Optional contract fields arrive as `''`, not `undefined`. `z.string().email()` fails on
  `''` — use `z.union([z.literal(''), z.string().email()])`.
- Bound everything: `totalKits` 1–500, `playerName` ≤20, `playerNumber` `/^\d{0,3}$/`,
  `instructions` ≤1000, `logoDataUrl` ≤8MB. Unbounded input is a DoS primitive.
- Enums (`kitType`, `sport`, `template`, `size`, `font`, `deliveryId`, `paymentId`) are
  `z.enum` allowlists, never free strings.
- Never spread `req.body` into an INSERT. List columns explicitly.

## Images and data URLs

- Validate by magic bytes (`file-type`), never `file.mimetype` or the data-URL prefix alone.
- Always re-encode through sharp with `limitInputPixels` set — strips EXIF/GPS and any
  embedded payload. `.rotate()` before stripping so orientation survives.
- JPEG/PNG/WebP only. Reject SVG.
- Storage keys are generated UUIDs; client filenames never touch a path.
- Write the file first, then the DB row.
- Serve stored files with `X-Content-Type-Options: nosniff` and
  `Content-Security-Policy: default-src 'none'; sandbox`.

## Auth

- Passwords: argon2id. Hash a dummy on unknown email so login timing doesn't leak whether
  an account exists.
- JWT carries `sub`, `role`, and `jti` only. Never put email, name, or an address in a token
  — a JWT payload is base64, not encrypted.
- `requireAuth` verifies the signature **and** that the `jti` row is not revoked or expired.
- `/orders` and `/contact` are unauthenticated: rate-limit them hard (10/hr and 5/hr per IP)
  and never let them read or write another user's rows.

## Output

- Never `res.json(row)` from a `SELECT *`. Pick fields explicitly. `password_hash` must never
  leave the repository layer.
- The `message` field is displayed to end users verbatim: no SQL, table names, driver codes,
  file paths, or stack traces. 500s say "Something went wrong on our end."
- Never log request bodies on `/auth/*` or `/orders`, `Authorization` headers, cookies, or
  image buffers.
