# API Contract — Kit World Sports Backend

This is the contract the frontend already codes against. It's frontend-first: the
React app was built to call these exact endpoints, so matching this shape means
zero frontend changes are needed once the backend is live — just point
`VITE_API_BASE_URL` at it.

## Getting connected

1. Set `VITE_API_BASE_URL` in the frontend's `.env` to wherever the Node server runs,
   e.g. `http://localhost:4000/api`.
2. **Enable CORS** on the Node server for the frontend's origin (`http://localhost:5173`
   in dev). Without it, requests fail with a generic network error that looks
   identical to "server not running" — an easy thing to lose time on.
3. Every request other than `/auth/*` may include `Authorization: Bearer <token>`
   (the frontend attaches it automatically once a user is signed in). The token can
   be a JWT or any opaque string your backend can validate.
4. On any error, respond with a non-2xx status and a JSON body containing a
   `message` field, e.g. `{ "message": "Invalid email or password." }` — the
   frontend reads `data.message` and displays it to the user directly.

### Important: don't get fooled by the fallback

Right now, if the frontend can't reach a server at all (connection refused / DNS
failure), it **silently falls back to local seed data / mock auth** instead of
showing an error — that's intentional so the demo works with no backend. It means
the app can look "fully working" even while your server is down or misconfigured.
The fallback only stops once your server actually responds (even with a 4xx/5xx).
Watch the browser console for `[productsService]` / `[authService]` warnings —
if you see those, your requests aren't reaching the server at all.

---

## Auth

### `POST /auth/login`
Request:
```json
{ "email": "user@example.com", "password": "plaintext-from-form" }
```
Response `200`:
```json
{
  "user": { "id": 1, "name": "Jane Doe", "email": "user@example.com", "avatar": "J" },
  "token": "opaque-or-jwt-string"
}
```
Response `401`: `{ "message": "Invalid email or password." }`
Response `403` — **added 2026-08-04**, when the password is correct but the email is unverified:
```json
{
  "message": "Please verify your email address to sign in.",
  "code": "EMAIL_NOT_VERIFIED",
  "details": { "verificationToken": "64-hex-chars", "expiresIn": 600 }
}
```
The client should route to the verification screen using `details.verificationToken`. This 403 is
returned **only after the password has been verified**, so it never reveals whether an address is
registered to someone who doesn't already know the password — an unverified account with a wrong
password returns the same generic 401 as an unknown address.

### `POST /auth/register`
Request:
```json
{ "name": "Jane Doe", "email": "user@example.com", "password": "plaintext-from-form" }
```
Response `200` — **CHANGED 2026-08-04: no longer returns a session token.** Registration now
creates the account in an unverified state and emails a 6-digit code:
```json
{
  "user": { "id": 1, "name": "Jane Doe", "email": "user@example.com", "avatar": "J" },
  "verification": { "token": "64-hex-chars", "expiresIn": 600 }
}
```
`verification.token` identifies the pending verification. **It is not a bearer credential** — it
grants nothing and must not be sent as `Authorization` or stored as a session.
Response `409`: `{ "message": "An account with this email already exists." }`

### `POST /auth/verify`
Exchanges the emailed code for a real session.
```json
{ "token": "<verification.token>", "code": "123456" }
```
Response `200`: `{ "user": {...}, "token": "..." }` — same shape login used to return.
Response `401`: `{ "message": "That code is incorrect.", "code": "CODE_INVALID", "details": { "attemptsRemaining": 4 } }`
Response `403`: `{ "message": "That code is no longer valid. Request a new one.", "code": "CODE_EXPIRED" }`
— returned when the code has expired (10 min), been used, or exhausted its 5 attempts.

### `POST /auth/resend`
```json
{ "token": "<verification.token>" }
```
Response `200`: `{ "expiresIn": 600 }` — a new code replaces the old one.
Response `429`: `RESEND_COOLDOWN` (60s between sends) or `RESEND_LIMIT` (10 per verification).

**Note:** `avatar` is just a single uppercase letter (first letter of the name) in
the current design — not a URL. Password rules already enforced client-side:
minimum 6 characters, at least one uppercase letter, at least one digit. Hash
passwords server-side (bcrypt/argon2) — do not reuse the frontend's local demo
hashing scheme (SHA-256, used only for the no-backend fallback).

---

## Catalog (read-only, no auth required)

### `GET /kits`
Response `200`: array of
```json
{ "id": 1, "slug": "cricket-shirt", "emoji": "🏏", "image": "https://.../cricket-shirt.png", "name": "Cricket Shirt", "sport": "cricket", "desc": "...", "color": "#1a3a1a" }
```
`sport` is one of: `cricket`, `football`, `basketball`, `training`, `others`.

### `GET /products`
Response `200`: array of
```json
{ "id": 1, "image": "https://.../cricket-shirt.png", "name": "Cricket Shirt", "cat": "cricket", "color": "#1a3a1a" }
```

### `GET /kits/featured`
Response `200`: array of
```json
{ "id": 1, "image": "https://.../cricket.jpg", "emoji": "🏏", "tag": "Featured", "sport": "cricket", "title": "Cricket Kit", "desc": "...", "color": "#8B6914", "accent": "#F5A623", "tagBg": "#3d3000", "hoverRgb": "138, 112, 0" }
```

**Images:** the frontend currently bundles these as local imports. Once served
from your API, `image` needs to be a real URL (static file server, S3, CDN — your
choice), not a filename or local path.

---

## Contact

### `POST /contact`
Request:
```json
{ "name": "Jane Doe", "phone": "+92 300 1234567", "email": "jane@example.com", "sport": "cricket", "message": "..." }
```
`phone` and `sport` may be empty strings (optional fields). Response: any 2xx: just persist it (e.g. as a lead/inquiry) and/or email it to the team inbox.

---

## Orders

### `POST /orders`

> **Changed 2026-08-13 (cart Phase 5).** An order is now a CART: one header plus one line per
> design. The former single-design body — `design` + `totalKits` + `primarySize` at the top level
> — **is no longer accepted** and returns `422` naming those keys as unrecognized. The columns it
> wrote (`orders.design_json`, `unit_price`, `primary_size`) were dropped in migration 008.

Request:
```json
{
  "items": [
    {
      "design": {
        "kitType": "jersey", "kitProduct": "Football Jersey", "sport": "football",
        "template": "solid", "size": "M", "customSize": "", "customSizeUnit": "in",
        "bodyColor": "#CC0000", "sleeveColor": "#1a1a1a", "numberColor": "#FFFFFF", "collarColor": "#1a1a1a",
        "playerName": { "front": "SMITH", "back": "" }, "playerNumber": { "front": "10", "back": "" },
        "font": "Bebas Neue", "logoDataUrl": null, "logoPreset": null
      },
      "size": "M",
      "quantity": 6
    },
    { "design": { "kitType": "shorts", "…": "…" }, "size": "L", "quantity": 5 }
  ],
  "contact": { "firstName": "Jane", "lastName": "Doe", "email": "jane@example.com", "phone": "+92 300 1234567", "clubName": "" },
  "address": { "street": "...", "city": "...", "province": "", "postalCode": "", "country": "Pakistan" },
  "deliveryId": "express",
  "paymentId": "bank",
  "instructions": ""
}
```

`design` is the full customizer state (see `src/customize/kitShapes.js` → `DEFAULT_DESIGN` for
every field it can contain — colors, template, logo, text positions, etc). `deliveryId` is one of
`standard`/`express`/`rush`/`international` (`DELIVERY_METHODS` in the same file). `paymentId` is
one of `bank`/`cod`.

Per line: `size` is the size ORDERED and is what reaches `order_items.size`; `design.size` is part
of the design snapshot and is not cross-checked against it. `quantity` is at least 1 per line.

**Bounds.** 1–20 lines. **The 5-kit minimum is cart-WIDE, not per line** — 3 jerseys + 2 shorts is
a valid order, a single line of 3 is not. Ceiling is 500 kits across all lines.

**`address.country` and `deliveryId` must agree.** Anything outside Pakistan must use
`international`; Pakistan must not. Mismatch is a `422` with the allowed ids in
`details.deliveryId`.

**There is no card payment option.** `paymentId` is `bank` (manually reconciled — payment details
are emailed, production starts once confirmed) or `cod`. Card was removed: nothing behind it ever
charged anything, so offering it implied a payment collection that never happened. Real card
processing would be a separate payment-gateway integration (Stripe/etc.), not part of this payload.

**`pricing` may still be sent and is ignored.** The server recomputes every figure from
`kit_prices` and `delivery_methods` and persists only its own. Send it or don't; a tampered total
changes nothing except a `price_mismatch` line in the server log.

**`Idempotency-Key` header** (optional, a UUID): send ONE key per checkout attempt and reuse it on
every retry of that attempt. A repeat returns the original order rather than creating a second.
Generating a fresh key per request populates the column while protecting nothing.

Response `201`:
```json
{
  "id": 44,
  "reference": "KW-2026-000044",
  "status": "placed",
  "pricing": {
    "items": [
      { "position": 1, "kitType": "jersey", "kitLabel": "Jersey",
        "templateName": "Solid", "sportLabel": "Football",
        "size": "M", "quantity": 6, "unitPrice": 2800, "lineTotal": 16800 }
    ],
    "totalKits": 11,
    "kitPrice": 24300,
    "deliveryName": "Express Delivery",
    "deliveryPrice": 500,
    "discount": 0,
    "total": 24800
  }
}
```
All money is whole PKR integers. Delivery is charged ONCE per cart, not per line.

### `POST /orders/quote`
**Requires auth.** Prices a cart in progress and **creates nothing** — no order, no lines, no
files. It exists so the cart and checkout pages never compute a price themselves.

```json
{ "items": [ { "design": { "…": "…" }, "size": "M", "quantity": 3 } ], "deliveryId": "standard" }
```

Same line shape and bounds as `POST /orders`, with no `contact` or `address` — a cart page has
neither, and demanding them to see a price would be absurd.

Response `200`: the `pricing` object above, plus:
- `deliveryOptions`: `[{ "id": "standard", "name": "Standard Delivery", "price": 0 }, …]` — every
  active method with its price, so the checkout selector can show all four without keeping a price
  table of its own.
- `belowMinimum` / `minimumKits`: a cart under the floor is still PRICED (`200`, `belowMinimum:
  true`) rather than refused, so the page can show a running total while the user decides whether
  to add more. Read `minimumKits` for the "add N more" message — never hardcode 5.

Response `422` `QUOTE_UNAVAILABLE`: a line can no longer be priced. `details.unavailableKitTypes`
lists retired kit types; `details.missingLogoPositions` lists 1-based line positions whose uploaded
logo has been swept away. Both are reported together in one response.

Rate limit: 120/hour per user (the cart re-quotes on every debounced edit). `POST /orders` is
10/hour per IP.

---

## Assets

### `POST /assets`
Uploads one logo and returns the URL to reference it by. **Requires auth** — send the bearer token
from `/auth/login`. Request:
```json
{ "dataUrl": "data:image/png;base64,iVBORw0KGgo..." }
```
`dataUrl` is a JPEG, PNG or WebP data URL, max 8MB of base64. **SVG is rejected** — it is XML and
can carry scripts. The declared type in the prefix is not trusted: the real format is decided by
sniffing the decoded bytes, so an SVG sent as `image/png` is still refused.

The image is re-encoded server-side (which strips EXIF/GPS), capped at 1024px on the long edge, and
stored under a generated name. Nothing about the stored file is caller-controlled — sending a
`filename`, a `mimetype` or any other extra key is a `422`.

Response `201`:
```json
{ "url": "/static/logos/9f1c4e2a-3b7d-4c81-9e05-2a6f4d8b1c33.webp", "bytes": 18422 }
```
`url` is root-relative — never an absolute URL with a host — and is what you put in
`design.logoDataUrl` when placing an order. Fetch it from the same origin to display the logo.

Errors: `401` (not signed in), `422` (not a supported image), `429` (more than 30 uploads in an
hour). Uploading the same image twice returns two different URLs; there is no deduplication by
content.

**`design.logoDataUrl` therefore accepts either form:** an inline `data:image/...` URL, or a
`/static/logos/<uuid>.webp` URL returned by this endpoint. Anything else — a path with `../`, an
absolute URL with a host, or a filename that is not one this server generated — is a `422`. A URL
whose file no longer exists is also a `422` (`ASSET_NOT_FOUND`), so upload and order placement
should not be separated by so long that a cleanup could run in between.

---

## Suggested MySQL tables (a starting point, not mandatory)

> **Dated record — this is the original suggestion, not the live schema.** The `orders` sketch
> below is single-design: `design_json NOT NULL` and one order = one kit. The real schema went
> header/lines in migration 007 (`orders` + `order_items`) and **dropped `design_json`,
> `unit_price` and `primary_size` from `orders` in migration 008 on 2026-08-13**. For what actually
> exists, read `src/db/migrations/`.

```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE kits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  sport VARCHAR(40) NOT NULL,
  emoji VARCHAR(8),
  image_url VARCHAR(255),
  description TEXT,
  color VARCHAR(7)
);

CREATE TABLE contact_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(40),
  email VARCHAR(190) NOT NULL,
  sport VARCHAR(40),
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL REFERENCES users(id),
  design_json JSON NOT NULL,
  contact_json JSON NOT NULL,
  address_json JSON NOT NULL,
  delivery_id VARCHAR(40) NOT NULL,
  payment_id VARCHAR(40) NOT NULL,
  total_kits INT NOT NULL,
  total_price INT NOT NULL,
  status VARCHAR(20) DEFAULT 'placed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Storing `design_json`/`contact_json`/`address_json` as JSON columns is the
pragmatic choice here — the design object in particular has many optional,
nested, evolving fields (see `DEFAULT_DESIGN`), and normalizing it into columns
would need updating every time the customizer gains a new option.
