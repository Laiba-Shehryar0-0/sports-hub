# Kit World Sports — Backend

Node.js + Express 4 + MySQL 8 REST API. The React frontend (Vite, Fabric.js v7) already
exists in a sibling folder and codes against a fixed contract — see `docs/API_CONTRACT.md`
and `docs/backend-plan.md`. **The contract defines request/response shapes. Match it.**

Users design a sports kit in a customizer (garment type, size, colours, template, player
name/number, optional logo), then place an order. Kits are made to order.

## Commands

- `npm run dev` — `node --watch src/server.js`
- `npm run migrate` / `npm run seed`
- `npm test` — vitest (must target `kitworld_test`, never `kitworld`)

## Stack decisions (do not change without asking me)

- ESM only (`"type": "module"`). Never write `require()`.
- `mysql2/promise` with a shared pool. **No ORM.**
- `zod` validation, `argon2` passwords, `pino` logs, `sharp` + `file-type` for images.
- Auth: JWT bearer, 7-day expiry, with a `jti` checked against a `sessions` table so
  logout and revocation actually work. No refresh endpoint — the contract has none.

## Architecture

Feature modules under `src/modules/<feature>/`:
`<feature>.routes.js` → `.controller.js` → `.service.js` → `.repository.js` → `.schema.js`

Features: `auth`, `catalog`, `orders`, `contact`, `pricing`, `assets`.

- **Routes**: path + middleware chain + handler. No logic.
- **Controllers**: unpack `req` → call service → respond. ~10 lines. No SQL.
- **Services**: business logic. Never reference `req`, `res`, or status codes.
- **Repositories**: the only place SQL is allowed.

Every repository function takes an optional last param `db = pool` for transactions.

## Response shapes — dictated by the frontend, do not "improve"

- `POST /auth/login|register` → `{ "user": { id, name, email, avatar }, "token": "..." }`
  (`avatar` is a single uppercase letter, not a URL)
- `GET /kits`, `/products`, `/kits/featured` → **bare JSON arrays**, no envelope
- `POST /contact` → `201 { "id": 12 }`
- `POST /orders` → `201 { "id", "reference", "pricing", "status" }`
- **Errors → flat, `message` at top level**:
  `{ "message": "...", "code": "...", "requestId": "...", "details": {...} }`
  The frontend reads `data.message` and shows it to the user, so `message` must never
  contain SQL, table names, driver codes, or stack traces.

Status codes: 200, 201, 401 (not logged in), 403 (logged in, not allowed), 404 (not found
*or* not yours), 409 (duplicate/conflict), 413, 415, 422 (validation), 429, 500.
Throw `AppError` from services; format centrally in `src/middlewares/errorHandler.js`.
Never `res.status(500)` inside a controller.

## Hard rules — violating any of these is a bug, not a style choice

1. **All SQL uses `?` placeholders.** Never build SQL with template literals. `ORDER BY`
   maps through a fixed allowlist. `LIMIT`/`OFFSET` only after zod bounds them to integers.
2. **NEVER trust `req.body.pricing`.** The client sends its own prices; recompute every
   figure from `kit_prices`, `delivery_methods`, and `promo_codes`. Persist and return only
   server-computed numbers. Log a `price_mismatch` warning when they differ.
3. **`logoDataUrl` never goes into the database as base64.** Decode it, validate magic bytes
   with `file-type`, re-encode through `sharp` (strips EXIF/GPS), write a UUID-keyed file,
   and replace the field with the stored URL before persisting.
4. **Uploads and data URLs are validated by magic bytes, never by a client-supplied
   mimetype.** JPEG/PNG/WebP only. **Reject SVG** — it is XML and can carry scripts.
5. **Never build a filesystem path from a client-supplied filename.** Generate a UUID key.
6. **Ownership goes in the WHERE clause**: `WHERE id = ? AND user_id = ?`. Never fetch then
   check in JS. Return 404, not 403, when it isn't the caller's.
7. **Every endpoint has a zod schema** via `validate`, with `.strict()` so unknown keys are
   rejected. Never spread `req.body` into SQL — list columns explicitly.
8. **Optional contract fields arrive as EMPTY STRINGS, not undefined.** `z.string().email()`
   fails on `''`. Use an explicit `z.union([z.literal(''), ...])` for optional email/phone/
   province/postalCode/clubName/customSize/instructions.
9. **Every array, string and number is bounded**: `totalKits` 5–500 (5 is the minimum order the
   checkout UI states and enforces; the server enforces it too so the floor is real, not a
   client-side nicety — changed from 1 on 2026-08-05), `playerName` ≤20,
   `playerNumber` `/^\d{0,3}$/`, `instructions` ≤1000, `logoDataUrl` ≤8MB.
10. **`express.json()` limit is 100kb globally**, raised to 6mb on the `/orders` route only.
11. **Orders use `idempotency_key`** with a unique index. A duplicate returns the existing
    order, not a second one.
12. **Money is `INT` whole PKR** — no minor units, no floats. Comment every money column.
13. **No `await` inside a `for` loop over rows.** Batch with `WHERE id IN (?)`.
14. **Never log or return** passwords, hashes, tokens, cookies, or full order bodies.
15. **Never inline `DB_PASSWORD` or any credential value into a bash command or a
    `node -e` script.** Read them from `process.env` via `dotenv` instead — inlined values
    land in shell history and terminal output, which is a log surface too.
16. **Never run `DELETE` or `UPDATE` without a `WHERE` clause** — any table, any context,
    including one-off cleanup scripts. Before removing test data: `SELECT` the target rows,
    print them, then scope the statement to explicit ids or a test-only pattern
    (`WHERE email LIKE 'smoke%@example.com'`). "The table only has test rows in it" is an
    assumption, not a guarantee — it is exactly the reasoning that deletes real data.

## Database

- Migrations append-only; never edit an applied file. Zero-pad names (`004_...`).
- All tables `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`. Use the `JSON` type, not `TEXT`.
- Anything you would `WHERE`, `ORDER BY`, or `SUM` on gets a real column — pricing totals
  and status live in columns, not inside `design_json`.
- `kits` is ONE table serving three projections (`/kits`, `/products`, `/kits/featured`).
  Different mappers in the repository, not different tables.
- State which index each new query uses. `EXPLAIN` must show no `Using filesort` on list
  endpoints.
- mysql2 returns `JSON` columns as parsed objects — never `JSON.parse` them. On write,
  always `JSON.stringify`; passing an object stores `"[object Object]"`.

## Not in scope — do not build

`/designs` save/load (no frontend calls it yet), admin CRUD UI, payment gateway
integration, product stock or inventory, shipping-carrier APIs, server-side image
export. `paymentId: 'cod'` is a complete implementation.

**`cart` was removed from this list on 2026-08-07** — a multi-item cart is now in scope and being
built. Orders move from one-design-per-order to a header/lines model (`orders` + `order_items`),
so treat any remaining single-design assumption in these rules as legacy.

## Config

All config from `src/config/env.js` (zod-validated, exits on failure). **Never read
`process.env` anywhere else.** New value → schema, `.env`, and `.env.example` together.

## Testing

Vitest + supertest. `src/app.js` exports `createApp()` and never calls `.listen()`.
Mandatory cases: tampered `pricing` is ignored, duplicate idempotency key returns one
order, empty-string optional fields validate, a non-image data URL is rejected, and
error bodies expose no internals.

## Working style

- Explain *why* before writing code touching auth, SQL, pricing, or uploads.
- If a request conflicts with these rules or with the API contract, say so instead of complying.
- Prefer editing existing files. Don't add dependencies without asking.
- Don't write README files or extra docs unless I ask.
