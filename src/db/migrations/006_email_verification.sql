-- Email verification via a 6-digit code.
--
-- One row per signup, not one per code: the pending token stays stable across resends so the
-- client never has to swap it mid-flow, and only one code is ever live. Issuing a new row per
-- resend would leave several codes valid at once — 10 resends x 5 attempts = 50 live guesses
-- against a 10^6 space, instead of 5.

ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL AFTER is_active;

CREATE TABLE email_verifications (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id          BIGINT UNSIGNED NOT NULL,
  -- SHA-256 of the opaque pending token. The token identifies the pending verification and is
  -- returned to the client; it is NOT a session token and grants nothing on its own.
  token_hash       CHAR(64) NOT NULL,
  -- HMAC-SHA256 of the 6-digit code, keyed by a value derived from JWT_SECRET. Plain SHA-256
  -- would be brute-forceable offline in milliseconds if this table leaked (only 10^6 candidates).
  code_hash        CHAR(64) NOT NULL,
  code_expires_at  DATETIME NOT NULL,        -- 10 minutes from issue/resend
  -- Deliberately outlives the code (24h): a user who waits 11 minutes must still be able to
  -- resend, which is impossible if the token they need to do it with has already expired.
  token_expires_at DATETIME NOT NULL,
  attempts         TINYINT UNSIGNED NOT NULL DEFAULT 0,   -- per code; reset on resend
  resend_count     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  last_sent_at     DATETIME NOT NULL,        -- drives the 60s cooldown
  consumed_at      DATETIME NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Serves POST /auth/verify and /auth/resend: WHERE token_hash = ?. The hot path.
  UNIQUE KEY uq_ev_token (token_hash),
  -- Serves "is there already a live verification for this user" on login-403 and re-register.
  KEY idx_ev_user_live (user_id, consumed_at),
  CONSTRAINT fk_ev_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
