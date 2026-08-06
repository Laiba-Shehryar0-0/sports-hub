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

## 🟡 No automated tests

`kitworld_test` exists but is empty; no vitest config is present. All verification so far is manual
(curl + direct DB assertions). CLAUDE.md lists the mandatory cases that need covering.

---

## 🟡 `validate` returns a generic message

A 422 body says `message: "Validation failed."` while the useful per-field text sits in `details`.
The frontend renders `message`, so users see the generic string unless a screen reads `details`
explicitly. Fixing it means changing shared `src/middlewares/validate.js` for every module.
