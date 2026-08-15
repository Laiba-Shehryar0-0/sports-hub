# Backend Plan — D Sports Hub

Reconciles `API_CONTRACT.md` (what the React app already calls) with what the backend
actually needs to do. **The contract wins on shapes.** Where I deviate, it's for a security
reason and it requires zero frontend change.

Supersedes the response-envelope and auth sections of both earlier guides.

---

## 0. What the frontend actually is

- Vite + React 18, Fabric.js v7 for the customizer canvas, Tailwind v4, React Router v6
- Falls back to local seed data when the server is unreachable — **this will fool you**
- Sends `Authorization: Bearer <token>` automatically once signed in
- Reads `data.message` from error responses and shows it to the user

**The design object is structured state, not a Fabric canvas dump.** `kitType`, `bodyColor`,
`sleeveColor`, `playerName.front`, `font`, etc. That's good news: it means I can write an
exact zod schema instead of validating an arbitrary layer tree. Fabric is a rendering detail
the backend never sees.

---

## 1. Three things in the contract that must change server-side

### 1.1 🔴 The client sends its own prices. Ignore them.

```json
"pricing": { "unitPrice": 2800, "kitPrice": 30800, "deliveryPrice": 500, "total": 31300 }
```

Open DevTools, edit `total` to `1`, submit. You've sold 11 football kits for one rupee.
This isn't hypothetical — it's the single most exploited bug in hand-rolled checkout code,
and it's currently baked into your contract.

**The fix requires no frontend change.** Accept the `pricing` object, then throw it away:

```js
// orderService.placeOrder
const priced = await pricingService.compute({
  kitType: design.kitType,          // 'jersey'
  template: design.template,        // 'solid'
  sport: design.sport,
  totalKits: order.totalKits,       // 11
  deliveryId: order.deliveryId,     // 'express'
});
// No promoCode input: promo codes are out of scope for now. discount is always 0.
// See "Known gaps" below for why.

// Compare, log, but ALWAYS persist and return the server's numbers.
if (order.pricing?.total != null && order.pricing.total !== priced.total) {
  logger.warn({
    event: 'price_mismatch',
    clientTotal: order.pricing.total,
    serverTotal: priced.total,
    ip: req.ip,
  }, 'client pricing did not match server pricing');
}

// priced.* is what goes into the DB and into the response. order.pricing is never stored.
```

That log line is your fraud signal *and* your staleness signal — it fires both when someone
tampers and when a user had the page open while you changed a price. Two different problems,
same detection.

**Why not reject with a 409?** Your contract says the frontend expects "any 2xx" and has no
handler for a pricing conflict. Rejecting would break checkout for the honest stale-page case.
Recompute silently, return the correct total in the response, and let the order confirmation
screen show the server's number. If you later add conflict handling to the frontend, switch
to 409 — it's the better UX.

**This needs server-side price tables.** Seed them from the same source the frontend uses
(`src/customize/kitShapes.js` → `DELIVERY_METHODS`, unit prices). See §3.

### 1.2 🟠 `logoDataUrl` is a base64 image inside the order JSON

```json
"logoDataUrl": null,   // ← but when a user uploads a logo, this is a data: URL
```

A 2MB PNG becomes ~2.7MB of base64 sitting inside `design_json`. Consequences: your
`express.json()` limit rejects it, or it lands in a JSON column you now read whole on every
order lookup, and `max_allowed_packet` becomes a real ceiling.

**Fix, again with no frontend change** — intercept it in the service:

```js
// Before persisting the order:
if (design.logoDataUrl?.startsWith('data:image/')) {
  const asset = await assetService.storeFromDataUrl(design.logoDataUrl, {
    ownerUserId: userId ?? null,
  });
  design.logoDataUrl = asset.url;        // now 'http://localhost:4000/files/u1/uuid.webp'
}
```

`storeFromDataUrl` decodes the base64, validates **magic bytes** (`file-type`), re-encodes
through `sharp` (which strips EXIF/GPS and destroys any embedded payload), caps dimensions,
and writes a UUID-keyed file. Same pipeline as §6 of the kit-customization guide — you're just
feeding it from a data URL instead of a multipart upload.

**Raise the body limit on `/orders` only**, not globally:

```js
router.post('/', express.json({ limit: '6mb' }), orderLimiter, validate({...}), handler);
```

Global 6mb means every endpoint is a memory-exhaustion target. Route-scoped means only the one
that needs it carries the risk. If you ever change the frontend, a separate `POST /assets`
upload returning an id is strictly better — but this works today.

### 1.3 🟡 No refresh endpoint, so the token is long-lived and unrevocable

Your contract has `/auth/login` and `/auth/register`, no `/auth/refresh`. The frontend
"attaches it automatically," which in practice means `localStorage`. That gives you:

- **XSS steals the session.** One bad dependency, one `dangerouslySetInnerHTML`, and the token
  is exfiltrated. `localStorage` is readable by any script on the page.
- **No logout that actually works.** A signed JWT stays valid until it expires. "Sign out"
  clears the browser; the token still works if someone copied it.

I'm not going to tell you to rewrite the frontend mid-project. **Match the contract, but add
revocation** — it costs one table and one indexed lookup you're already doing:

```sql
CREATE TABLE sessions (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  jti        CHAR(36) NOT NULL,          -- matches the JWT's jti claim
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  user_agent VARCHAR(255) NULL,
  ip         VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sessions_jti (jti),
  KEY idx_sessions_user (user_id, revoked_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Sign the JWT with a `jti`, 7-day expiry. `requireAuth` verifies the signature **and** checks
the `jti` row isn't revoked. Now `POST /auth/logout` works for real, and you can kill every
session for a user. The cost is one query per request — and `requireAuth` already fetches the
user, so join it and the cost is zero extra round trips.

**The upgrade path,** when you have time: move to a 15-minute access token plus an httpOnly
refresh cookie (§5 of the first guide). It's about 15 lines of frontend change — an axios
interceptor and `credentials: 'include'`. Worth doing before anyone else uses this. Not worth
blocking on now.

---

## 2. Response shapes — the contract overrides my earlier guides

I told you to use `{ data: ... }` / `{ error: { message } }`. **Your frontend doesn't read
that**, so it's wrong. Use these:

| Endpoint | Success body |
|---|---|
| `POST /auth/login`, `/auth/register` | `{ "user": {...}, "token": "..." }` |
| `GET /kits`, `/products`, `/kits/featured` | a bare JSON array |
| `POST /contact` | `{ "id": 12 }`, 201 |
| `POST /orders` | `{ "id": 44, "reference": "KW-2026-000044", "pricing": {...}, "status": "placed" }`, 201 |

**Errors — flat, with `message` at the top level:**

```json
{
  "message": "Invalid email or password.",
  "code": "BAD_CREDENTIALS",
  "requestId": "9f3c...",
  "details": { "email": ["Invalid email"] }
}
```

The frontend reads `data.message` and displays it. `code`, `details`, and `requestId` are extra
fields it ignores today and can use later. This is the one place your `errorHandler` differs
from my first guide — change the JSON shape, keep everything else (status mapping, driver-error
translation, no stack traces in production).

**Because `message` is shown directly to users, it must never contain internals.** No SQL, no
table names, no `ER_DUP_ENTRY`. A 500 says "Something went wrong on our end." and nothing more.

**Add `GET /auth/me`** even though the contract omits it. Without it the frontend can't tell a
valid token from an expired one on page reload — it just trusts whatever's in localStorage.
Harmless to add, and the frontend can adopt it in three lines later.

---

## 3. Schema

Keep the contract's suggested tables as the shape, with these corrections.

```sql
-- 001_init.sql
CREATE TABLE users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- + the sessions table from §1.3
```

`VARCHAR(190)` on email is deliberate — it's the classic utf8mb4 index-length limit habit.
Fine to keep, and it matches the contract.

```sql
-- 002_catalog.sql
CREATE TABLE kits (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug         VARCHAR(80)  NOT NULL,
  name         VARCHAR(120) NOT NULL,
  sport        ENUM('cricket','football','basketball','training','others') NOT NULL,
  emoji        VARCHAR(8)   NULL,
  image_url    VARCHAR(500) NULL,
  description  TEXT         NULL,
  color        CHAR(7)      NULL,
  -- extra fields the /kits/featured projection needs:
  is_featured  TINYINT(1)   NOT NULL DEFAULT 0,
  featured_tag VARCHAR(40)  NULL,
  accent       CHAR(7)      NULL,
  tag_bg       CHAR(7)      NULL,
  hover_rgb    VARCHAR(20)  NULL,
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  UNIQUE KEY uq_kits_slug (slug),
  KEY idx_kits_browse (is_active, sport, sort_order),
  KEY idx_kits_featured (is_featured, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**One table, three projections.** `/kits`, `/products`, and `/kits/featured` return overlapping
subsets of the same rows — `/products` is just `{id, image, name, cat, color}` with `cat` being
`sport` renamed. Don't build three tables. Build one and three mappers in the repository. If
they later diverge genuinely, split then.

```sql
-- 003_pricing.sql  ← this table is what fixes §1.1
CREATE TABLE kit_prices (
  id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kit_type    VARCHAR(40) NOT NULL,      -- 'jersey','polo','jumper','shorts','socks','cap'
  kit_label   VARCHAR(80) NOT NULL,      -- 'Jersey','Polo','Jumper','Shorts','Socks','Cap' — KIT_TYPES.label
  unit_price  INT UNSIGNED NOT NULL,     -- whole PKR. See money note below.
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_kit_price (kit_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

No `template` column: `BASE_PRICES` in `kitShapes.js` is keyed by `kit_type` alone — there is no
per-template price variation in the source data (see `docs/EXTRACTED.md`).

> **`BASE_PRICES` was deleted from `kitShapes.js` on 2026-08-12** and the frontend no longer prices
> anything. The decision above stands and the reasoning is unchanged — `kit_prices` is still keyed
> by `kit_type` alone — but read the sentence as the dated record of where that shape came from,
> not as a claim about live frontend code.

**`kit_label` is a display lookup, not a price input** — it never participates in the price
calculation, it's just so the `/orders` response's `pricing.kitLabel` can be a plain `SELECT`
alongside `unit_price` instead of a second round trip into a static JS map. `templateName` and
`sportLabel`, by contrast, stay as static id→label lookups from `kitShapes.js` (`DESIGN_TEMPLATES`,
`SPORTS`) — there's no per-template or per-sport pricing table to attach them to.

```sql
CREATE TABLE delivery_methods (
  id         VARCHAR(40) NOT NULL PRIMARY KEY,   -- 'standard','express','rush','international'
  name       VARCHAR(80) NOT NULL,
  price      INT UNSIGNED NOT NULL,
  eta_days   VARCHAR(40) NULL,
  is_active  TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

No `promo_codes` table. Promo-code support is out of scope for now — see "Known gaps" at the
bottom of this doc for why, and what would need to change before it can be built.

**Money note, correcting my earlier advice.** I told you to store cents. Your contract uses
whole rupees (`unitPrice: 2800` = Rs 2,800), and PKR has no circulating minor unit. **Store
whole PKR as `INT` and document it.** The principle that mattered was "integers, never floats,
one consistent unit" — not the specific unit. Don't retrofit ×100 for its own sake; do write
`-- whole PKR, no minor units` next to every money column so nobody guesses.

> **Three of these columns no longer exist.** `design_json`, `unit_price` and `primary_size` were
> made nullable by migration 007 (orders went header/lines: `orders` + `order_items`) and
> **dropped by migration 008 on 2026-08-13**, with the legacy single-design payload they served.
> The design, the ordered size and the unit price are now per LINE, on `order_items`. Read the DDL
> below as the dated record of the original single-design design — the reasoning under it still
> holds, and `src/db/migrations/` is what the table actually looks like.

> **`payment_id`'s `ENUM` narrowed from `('card','bank','cod')` to `('bank','cod')` on 2026-08-14**
> (migration 009) — 'Card' was removed as a payment option; nothing behind it ever charged
> anything (see the note near the `paymentId` zod schema below).

```sql
-- 004_orders.sql  (as originally specified — see the note above)
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
  -- SERVER-COMPUTED pricing snapshot. The client's numbers are never stored.
  unit_price     INT UNSIGNED NOT NULL,
  kit_price      INT UNSIGNED NOT NULL,
  delivery_price INT UNSIGNED NOT NULL,
  discount       INT UNSIGNED NOT NULL DEFAULT 0,  -- always 0 until promo codes are in scope
  total_price    INT UNSIGNED NOT NULL,
  status         ENUM('placed','confirmed','in_production','shipped','delivered','cancelled')
                 NOT NULL DEFAULT 'placed',
  idempotency_key CHAR(36) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_order_ref (reference),
  UNIQUE KEY uq_order_idem (idempotency_key),
  KEY idx_order_user (user_id, created_at),
  KEY idx_order_status (status, created_at),
  KEY idx_order_email ((CAST(contact_json->>'$.email' AS CHAR(190)))),  -- guest lookup
  CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Three things worth defending here:

- **Pricing gets real columns, not just `design_json`.** You will want "revenue this month"
  and "orders over Rs 50,000." Those are `SUM(total_price)` and `WHERE total_price > ?` — both
  impossible to index inside a JSON blob. The rule from earlier holds: anything you'd `WHERE`
  or `SUM` on gets a column.
- **The functional index on `contact_json->>'$.email'`** lets a guest look up their order by
  email without normalizing contact into its own table. MySQL 8 supports indexing a generated
  expression; this is the one place JSON querying earns its keep.
- **`idempotency_key`** — your checkout has no double-submit guard. A user double-clicks
  "Place Order" or their connection drops mid-request and the browser retries, and you get two
  identical Rs 31,300 orders. The unique key makes the second insert fail; you catch
  `ER_DUP_ENTRY` and return the existing order. The frontend should send a UUID header per
  checkout attempt — **this is the one small frontend change I'd actually ask for**, about
  three lines.

```sql
-- 005_contact.sql
CREATE TABLE contact_submissions (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  phone      VARCHAR(40)  NULL,
  email      VARCHAR(190) NOT NULL,
  sport      VARCHAR(40)  NULL,
  message    TEXT NOT NULL,
  ip         VARCHAR(45)  NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_contact_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 4. Validating the order payload

The design object is structured state, so every field gets a bound. Enum lists below are copied
verbatim from `src/customize/kitShapes.js` → `DEFAULT_DESIGN`, `DELIVERY_METHODS`, as extracted in
`docs/EXTRACTED.md`.

```js
const HEX = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

// Optional string fields in this contract arrive as EMPTY STRINGS, not undefined.
// z.string().email() FAILS on '' — this is the single most common bug when wiring
// a real backend to an existing form. Handle it explicitly.
const optionalEmail = z.union([z.literal(''), z.string().email()]).optional().default('');
const optionalText = (max) => z.string().max(max).optional().default('');

const designSchema = z.object({
  kitType:     z.enum(['jersey', 'polo', 'jumper', 'shorts', 'socks', 'cap']),
  // WIDENED 2026-08-03 from 3 values to 5, so this now matches the catalog sport enum used by
  // /kits, /products, /kits/featured. Why: SPORT_KIT_GROUPS in the customizer has five groups
  // (cricket/football/basketball/training/others) and a kit's sport is derived from the group
  // that owns it. Under the old 3-value enum the 8 kits in `training` and `others` had no
  // representable sport, so design.sport was never written at all and every order reported the
  // DEFAULT_DESIGN value ('football'). Keeping the two enums identical removes that whole class
  // of bug — there is no longer a mapping step that can fail.
  sport:       z.enum(['football', 'basketball', 'cricket', 'training', 'others']),
  template:    z.enum([
    'solid', 'striped', 'diagonal', 'two-tone', 'hoops', 'halves',
    'chevron', 'sash', 'fade', 'fade-left', 'dots', 'sleeves',
  ]),
  size:        z.enum(['S', 'M', 'L', 'XL', 'Custom']),
  customSize:  optionalText(40),
  customSizeUnit: z.enum(['in', 'cm']).optional().default('in'),
  bodyColor: HEX, sleeveColor: HEX, numberColor: HEX, collarColor: HEX,
  playerName: z.object({
    front: z.string().max(20).default(''),      // it's a jersey, not a paragraph
    back:  z.string().max(20).default(''),
  }),
  playerNumber: z.object({
    front: z.string().regex(/^\d{0,3}$/).default(''),
    back:  z.string().regex(/^\d{0,3}$/).default(''),
  }),
  font: z.enum([
    'Bebas Neue', 'Impact', 'Georgia', 'Courier New', 'Oswald',
    'Anton', 'Montserrat', 'Teko', 'Russo One', 'Archivo Black',
  ]),
  // Bounded: 8MB of base64 is ~6MB decoded, which the /orders body limit allows.
  logoDataUrl: z.string().max(8_000_000).regex(/^data:image\/(png|jpeg|webp);base64,/)
                .nullable().default(null),
  logoPreset: z.string().max(60).nullable().default(null),
}).strict();

export const createOrderSchema = z.object({
  design: designSchema,
  contact: z.object({
    firstName: z.string().trim().min(1).max(60),
    lastName:  z.string().trim().min(1).max(60),
    email:     z.string().trim().toLowerCase().email().max(190),
    phone:     z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/),
    clubName:  optionalText(120),
  }).strict(),
  address: z.object({
    street: z.string().trim().min(1).max(255),
    city:   z.string().trim().min(1).max(100),
    province: optionalText(100),
    postalCode: optionalText(20),
    country: z.string().trim().min(2).max(80).default('Pakistan'),
  }).strict(),
  deliveryId: z.enum(['standard', 'express', 'rush', 'international']),
  paymentId:  z.enum(['card', 'bank', 'cod']),
  // Minimum 5, not 1 (changed 2026-08-05): the checkout UI states and enforces a 5-kit minimum,
  // so the server enforces it too. pricing.service.js re-checks the same bound, since it is the
  // last thing between an order and a persisted money column.
  totalKits:  z.coerce.number().int().min(5).max(500),
  primarySize: z.enum(['S', 'M', 'L', 'XL', 'Custom']),
  instructions: optionalText(1000),
  // Accepted so the request validates, then IGNORED. Never trusted, never stored.
  pricing: z.any().optional(),
}).strict();
```

> **`design`, `totalKits` and `primarySize` were removed from this schema on 2026-08-13** (cart
> Phase 5). The payload is now `items: [{ design, size, quantity }]` — the 5-kit minimum became
> cart-WIDE rather than a bound on a single field, and the ordered size moved onto the line. Every
> bound defended below still applies; they moved, they were not relaxed. Live shape:
> `src/modules/orders/orders.schema.js`.

Why the specific bounds:

- **`totalKits` max 500** — unbounded means someone orders 999,999,999 kits and your `INT`
  multiplication overflows into a nonsense total.
- **`playerName` max 20** — it's printed on a shirt. Without a cap, the field is a free text
  store.
- **`.strict()` everywhere** — unknown keys rejected. Same mass-assignment defence as always.
- **`pricing: z.any()`** — deliberately permissive because you're going to discard it. Don't
  spend validation effort on a field you'll never read.

**Card details:** the contract confirms they never reach `/orders`, only `paymentId`. Keep it
that way. If a card number ever appears in a request body, you're in PCI-DSS scope, and that's
a compliance project rather than a feature.

> **'Card' was removed as a `paymentId` value on 2026-08-14.** The checkout form validated card
> number/expiry/CVV format client-side but never charged anything — no gateway integration exists
> — so offering it implied a payment collection that never happened. `paymentId` is now
> `z.enum(['bank', 'cod'])`; live shape: `src/modules/orders/orders.schema.js`.

---

## 5. Endpoints to build, in priority order

**Build these — the frontend calls them today:**
```
POST /api/auth/register      POST /api/auth/login
GET  /api/kits               GET  /api/kits/featured      GET /api/products
POST /api/contact
POST /api/orders
```

**Add these — cheap, and the frontend can adopt them in a few lines:**
```
GET  /api/auth/me            POST /api/auth/logout        (real revocation, §1.3)
GET  /api/orders/:reference  GET  /api/orders             (mine — "order history" hook)
```

**Do NOT build yet:**
- `/designs` save/load. Your PDF wants it, your contract has no endpoint for it, and your
  frontend has no "My Designs" page. Building endpoints nobody calls is how projects miss
  deadlines. Add it in week 6 *if* the frontend gets that screen.
- Admin CRUD. Seed the catalog and edit it with SQL until an admin UI exists.
- Payment gateway. `paymentId: 'cod'` is a complete, honest implementation.

**Rate limits** — `/contact` and `/orders` are **unauthenticated**, which makes them your
spam and abuse surface. `/contact` at 5/hour per IP, `/orders` at 10/hour per IP, plus the
global limiter. A honeypot field on the contact form costs nothing and stops most bots.

---

## 6. Testing against a frontend that lies to you

From your own contract: when the server is unreachable, the app silently falls back to seed
data and mock auth. **A working-looking app proves nothing.** Every time you finish an endpoint:

1. Open the browser console. `[productsService]` / `[authService]` warnings mean your request
   never arrived.
2. Check the Network tab for an actual request to `localhost:4000`, with a real status code.
3. Test in the **browser**, not only Postman — Postman ignores CORS, so a CORS
   misconfiguration passes there and fails in the app.

The fastest way to prove the wiring is real: change a kit's name directly in MySQL and reload
the page. If the name changes, you're talking to the server. If it doesn't, you're looking at
seed data.

---

## 7. Corrections to my earlier guides

| Earlier advice | Correction |
|---|---|
| `{ data: ... }` success envelope | Bare objects/arrays per the contract |
| `{ error: { message, code } }` nested | Flat `{ message, code, requestId, details }` |
| Store money in cents | Whole PKR as `INT` — no minor unit in circulation |
| Access token 15m + refresh cookie | JWT 7d + `sessions.jti` revocation, matching the contract |
| Build a `/designs` module | Not yet — no frontend calls it |
| Design doc as a layer tree with `assetId` | Structured state object; `logoDataUrl` → stored file URL |
| Products/variants/stock tables | No stock. Kits are made to order. |
| `SELECT ... FOR UPDATE` for stock | Not needed. Use `idempotency_key` against double-submit instead. |

Everything else from `sportskit-backend-guide.md` stands: project setup, pool, prepared
statements, transactions, migrations, indexing, error handling, logging, validation middleware,
rate limiting, argon2, RBAC, ownership checks, testing, OpenAPI, CORS, graceful shutdown.

---

## 8. Known gaps

**Promo codes are out of scope until the frontend sends a top-level `promoCode` field.**
`Checkout.jsx` only ever sends the resulting discount fraction (`pricing.promoApplied`, e.g.
`0.1`/`0.15`) — never the code text (`SAVE10`/`HUB15`) the customer actually typed — and that
fraction lives inside the `pricing` object the backend is required to discard entirely (rule 2 /
§1.1). There is currently no way for the server to know which promo code, if any, a customer
entered, so it cannot validate a code, look up a `promo_codes` row, or apply a discount safely.

Building `promo_codes` and discount logic against today's contract would mean trusting the
client's own discount amount — exactly the vulnerability §1.1 exists to close. So: no
`promo_codes` table, no discount calculation beyond `0`, and `pricing.promoApplied` is read by
nothing. `discount` stays as a real column on `orders` (always `0` for now) so the schema doesn't
need a breaking migration once this is unblocked.

**To unblock:** the frontend needs one small, additive change — send the raw code (e.g. a
top-level `promoCode: "SAVE10"` string, sent alongside, not inside, the discarded `pricing`
object) — after which `kit_prices`/`delivery_methods`-style promo table and server-side
recomputation can be added the same way §1.1 was.
