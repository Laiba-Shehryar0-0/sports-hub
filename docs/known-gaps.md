# Known gaps

Things that are deliberately incomplete, temporary, or unsafe outside development.
Each entry says what it is, why it exists, and what has to happen before deploy.

---

## 🔴 Verification codes are logged to the console in development

**Remove or disable before any production deploy.**

`src/modules/auth/auth.mailer.js` prints the 6-digit email-verification code to the server log
when `NODE_ENV === 'development'`, so the signup flow can be completed without SMTP credentials.

**Why it's dangerous.** A verification code is a live credential. Anyone who can read the log can
take over an account mid-signup. Logs get shipped to aggregators, retained for months, and read by
people who would never be given account access — which is why CLAUDE.md rule 14 forbids logging
credentials at all. This is a deliberate, scoped exception.

**How it's contained today:**

- Gated on an exact `NODE_ENV === 'development'` match — **not** `!isProduction`, which would also
  be true under `NODE_ENV=test`.
- The dev branch returns before the SMTP transport is ever touched, so the code-logging path and
  the real sending path are mutually exclusive rather than merely conditional.
- A boot-time assertion throws if the dev flag and `env.isProduction` are ever both true.
- Verified in all three environments: `development` logs the code, `test` logs
  `"Verification email suppressed"` with no code, `production` goes to the real mailer and logs
  only a failure without the code.

**To remove:** set real `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` (Mailtrap is fine for
development) and delete the `DEV_CODE_LOGGING` branch in `auth.mailer.js`. Production already
refuses to boot without `SMTP_HOST` — `src/config/env.js` fails the parse — so the code path is
unreachable there, but the branch should not survive into a release build regardless.

---

## 🟡 The catalog API can only serve one image per kit

`kits.image_url` is the only image column, and all three projections (`toKit`, `toProduct`,
`toFeaturedKit`) return a single `image`. Garments that have a back view — `cricket-trousers`,
`football-shorts`, `team-socks` and others — carry `imageBack` **only** in `SPORT_KIT_GROUPS` in
the frontend's `Customize.jsx`, which is a hardcoded constant and never fetched from the API.

So the customizer can show a back view while the catalog cannot. Fine today, because only the
customizer needs it. Serving it from the API would need a nullable `image_back_url` column
(migration 007), the column added to `CATALOG_COLUMNS`, and the mappers updated — which changes
the documented `/kits` response shape, so it needs a frontend-contract decision first.

*(Resolved 2026-08-05: `team-socks` previously used the old `boxing-kit.png` renamed, so the
thumbnail was a pair of boxing gloves. Real artwork is now in place — a single `socks.png`, with
no back view.)*

---

## 🟠 The pending verification token is single-valued

`email_verifications.token_hash` holds one token per signup. Any path that issues a new one —
notably the `403 EMAIL_NOT_VERIFIED` response from `POST /auth/login` — invalidates the previous
one. Two concurrent verification flows for the same account (e.g. the signup tab plus a second tab
that tried to log in) will see the older tab's token stop working with `CODE_EXPIRED`.

Acceptable because the newest issuance is the one the user is actually looking at, and the recovery
is a single "resend". Fixing it properly means a separate token table with multiple live rows.

---

## 🟠 Expired sessions and verifications are never cleaned up

`sessions` and `email_verifications` rows accumulate forever. Neither is on a request path once
expired, so this is a storage issue rather than a correctness one. Eventual answer is a periodic
sweep:

```sql
DELETE FROM sessions            WHERE expires_at       < NOW() - INTERVAL 30 DAY;
DELETE FROM email_verifications WHERE token_expires_at < NOW() - INTERVAL 30 DAY;
```

---

## 🟠 Uploaded logos are never cleaned up — and "orphan" is not server-observable

`POST /api/assets` writes into `env.LOGO_DIR` before any order exists, so files accumulate from
every abandoned design. There is no cleanup job, and adding a naive one would be worse than the
leak.

**Why the obvious cleanup is dangerous.** A logo attached to a live design or a cart item is
referenced *only* from that user's `localStorage`. Server-side it is **indistinguishable from an
orphan**. A job that diffs the logos directory against `orders.design_json` and
`order_items.design_json` **will delete logos out of live carts and in-progress designs** — the
kit then renders with a broken image and the user has no idea why, having done nothing wrong.

**What any future cleanup must do:**

- Apply a **minimum file-age grace period well beyond a typical cart lifetime**. A cart can sit in
  `localStorage` for weeks; 90 days is a starting point, not a considered answer.
- **LIST candidates, print them, and delete by explicit id/path** — never a `DELETE` or an
  `unlink` driven by a computed `WHERE` or a glob (CLAUDE.md rule 16). A computed predicate over a
  set the server cannot fully observe is exactly the shape that once destroyed a real account.
- Prefer moving to a quarantine directory first and deleting on a second pass, so a mistake is
  recoverable rather than final.

**Cheapest real fix** is to stop guessing: record uploads in a table with `user_id` and
`created_at`, and mark a row referenced when it lands on an order. Then "orphan" becomes a fact the
server knows rather than an inference from the filesystem. That is a schema change, so it is not in
this phase.

---

## 🟠 One logo file is tracked inside an ignored directory

`public/static/logos/` is in `.gitignore` — uploads are runtime data, not source, and 12
test-generated files had already been committed by accident (removed in `cf11727`). But
`088f2e63-8f49-4a03-8af6-fd46fcbe6f13.webp` is **deliberately still tracked**: it is the logo on
`KW-2026-000002`, the only real order, and untracking it would leave a fresh clone rendering a
broken image for it.

**Why it's a trap, not just an exception.** gitignore does not apply to files git already tracks,
so this one file quietly outranks the rule around it. The moment that logo is *replaced* — the
order re-placed, the image re-uploaded, an asset pipeline re-run — the replacement is written under
a **new UUID filename**, which the ignore rule does cover. `git add` skips it silently. Nothing
errors, the commit looks clean, `orders.design_json` points at the new UUID, and a fresh clone
renders a broken image. The failure appears one clone later, far from the change that caused it.

This is the same shape as the orphan-cleanup gap (added with Phase 2, `POST /api/assets`): the
filesystem and the database each hold half the truth, and neither notices the other drifting.

**How it's contained today:** a comment in `.gitignore` states the exception and says it is not
retroactive. That is documentation, not a mechanism — nothing fails if it is violated.

**Real fix, when uploads stop being incidental:** stop letting any upload be load-bearing in git.
Either keep the one order's logo in a committed fixtures directory outside the ignored path and
point the seed at it, or give the environment a documented restore step. Until then, a replacement
must be added with an explicit `git add -f <path>`, and the `.gitignore` comment updated to name
the new UUID.

**To detect drift:** every `logoDataUrl` in `orders.design_json` / `order_items.design_json` should
resolve to a file that is either tracked or reproducible. A `git check-ignore -v` over that list
would catch a replacement that had been silently ignored.

---

## 🟠 `trust proxy` is not set

`src/app.js` never calls `app.set('trust proxy', …)`. Correct today (direct connections, so
`req.ip` is the real peer). Behind nginx/Cloudflare/a load balancer, **every client collapses into
one rate-limit key** and `sessions.ip` records the proxy. Set a specific hop count or subnet at
that point — never `true`, which lets anyone spoof `X-Forwarded-For`.

---

## 🟡 Rate-limit counters are per-process and reset on restart

`express-rate-limit` uses the in-memory `MemoryStore`, so limits are per Node process and cleared
by a redeploy. The verification attempt cap and resend cooldown are deliberately DB-backed for this
reason, but the HTTP-level limiters are not. Move to Redis when scaling past one process, and give
each limiter a distinct `prefix` at that point.

---

## 🟡 Test coverage is uneven across modules

*(Rewritten 2026-08-08 — this entry previously read "No automated tests", which stopped being true
once vitest landed.)*

`vitest.config.js` pins `NODE_ENV=test` so the suite can only reach `kitworld_test`, and
`assets.service` refuses to write outside a temp directory there. 144 tests pass across `pricing`,
`orders` and `assets`.

Still uncovered: `catalog` and `auth` have no suites of their own — both are exercised only
incidentally through `orders` fixtures. Nothing fetches a stored logo over HTTP, so the
`/static/logos` mount order is unverified by any committed test (it was proven by an ad-hoc probe;
a round-trip assertion belongs with `POST /api/assets`).

---

## 🟡 `validate` returns a generic message

A 422 body says `message: "Validation failed."` while the useful per-field text sits in `details`.
The frontend renders `message`, so users see the generic string unless a screen reads `details`
explicitly. Fixing it means changing shared `src/middlewares/validate.js` for every module.
