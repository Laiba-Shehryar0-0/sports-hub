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

### `POST /auth/register`
Request:
```json
{ "name": "Jane Doe", "email": "user@example.com", "password": "plaintext-from-form" }
```
Response `200`: same shape as login.
Response `409`: `{ "message": "An account with this email already exists." }`

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
Request:
```json
{
  "design": {
    "kitType": "jersey", "sport": "football", "template": "solid", "size": "M",
    "customSize": "", "customSizeUnit": "in",
    "bodyColor": "#CC0000", "sleeveColor": "#1a1a1a", "numberColor": "#FFFFFF", "collarColor": "#1a1a1a",
    "playerName": { "front": "SMITH", "back": "" }, "playerNumber": { "front": "10", "back": "" },
    "font": "Bebas Neue", "logoDataUrl": null, "logoPreset": null
  },
  "contact": { "firstName": "Jane", "lastName": "Doe", "email": "jane@example.com", "phone": "+92 300 1234567", "clubName": "" },
  "address": { "street": "...", "city": "...", "province": "", "postalCode": "", "country": "Pakistan" },
  "deliveryId": "express",
  "paymentId": "card",
  "totalKits": 11,
  "primarySize": "M",
  "instructions": "",
  "pricing": {
    "kitLabel": "Jersey", "templateName": "Solid", "sportLabel": "Football",
    "unitPrice": 2800, "kitPrice": 30800,
    "deliveryName": "Express Delivery", "deliveryPrice": 500,
    "discount": 0, "promoApplied": null, "total": 31300
  }
}
```
`design` is the full customizer state (see `src/customize/kitShapes.js` →
`DEFAULT_DESIGN` for every field it can contain — colors, template, logo, text
positions, etc). `deliveryId` is one of `standard`/`express`/`rush`/`international`
(`DELIVERY_METHODS` in the same file). `paymentId` is one of `card`/`bank`/`cod`.

**Card details are validated client-side but are never sent to `/orders`** — only
`paymentId` is sent. If you need real card processing, that's a separate payment-
gateway integration (Stripe/etc.), not part of this payload.

Response: any 2xx — return at least an order id/reference so a future "order
history" feature has something to key off.

---

## Suggested MySQL tables (a starting point, not mandatory)

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
