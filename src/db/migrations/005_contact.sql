CREATE TABLE contact_submissions (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  phone      VARCHAR(40)  NULL,
  email      VARCHAR(190) NOT NULL,
  sport      VARCHAR(40)  NULL,
  message    TEXT NOT NULL,
  ip         VARCHAR(45)  NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  -- No index on created_at: POST /contact is create-only, no admin inbox
  -- endpoint exists to sort recency against. Add one in a later migration
  -- if/when that view lands.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
