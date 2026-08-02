-- Users and auth sessions (docs/backend-plan.md §1.3, §3).

CREATE TABLE users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Serves POST /auth/login (lookup by email) and POST /auth/register
  -- (duplicate-email check before insert).
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Gives JWTs real revocation (7-day expiry, jti checked on every request).
CREATE TABLE sessions (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  jti        CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  user_agent VARCHAR(255) NULL,
  ip         VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Serves requireAuth on every authenticated request:
  -- SELECT ... FROM sessions WHERE jti = ?  (verify token wasn't revoked).
  -- The hottest query against this table — one per request.
  UNIQUE KEY uq_sessions_jti (jti),
  -- Serves POST /auth/logout "sign out everywhere":
  -- UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL.
  KEY idx_sessions_user (user_id, revoked_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
