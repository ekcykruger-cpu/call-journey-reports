-- 002: login sessions (used by server/src/auth/sessionStore.js). expires_at is UTC.
CREATE TABLE sessions (
  sid         VARCHAR(128) NOT NULL PRIMARY KEY,
  expires_at  DATETIME NOT NULL,
  data        MEDIUMTEXT NOT NULL,
  KEY ix_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
