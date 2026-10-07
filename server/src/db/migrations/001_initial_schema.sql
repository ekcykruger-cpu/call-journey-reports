-- 001: initial schema. See docs/data-dictionary.md for column meanings.
-- All DATETIME columns ending in _local are Australia/Sydney wall-clock time; _utc / created_at etc. are UTC.

CREATE TABLE users (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email          VARCHAR(255) NOT NULL,
  display_name   VARCHAR(100) NULL,
  password_hash  VARCHAR(255) NULL,            -- NULL until an invite is accepted
  role           ENUM('admin','viewer') NOT NULL DEFAULT 'viewer',
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  failed_logins  INT NOT NULL DEFAULT 0,
  locked_until   DATETIME NULL,
  last_login_at  DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Invite and password-reset tokens. Only the SHA-256 hash of the token is stored.
CREATE TABLE auth_tokens (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  purpose     ENUM('invite','reset') NOT NULL,
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_auth_tokens_hash (token_hash),
  KEY ix_auth_tokens_user (user_id),
  CONSTRAINT fk_auth_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One row per data load (CXone fetch or manual CSV upload).
CREATE TABLE imports (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source            ENUM('cxone','upload') NOT NULL,
  range_start       DATE NULL,
  range_end         DATE NULL,
  file_name         VARCHAR(255) NULL,
  status            ENUM('queued','running','done','failed') NOT NULL DEFAULT 'queued',
  rows_read         INT NOT NULL DEFAULT 0,
  rows_upserted     INT NOT NULL DEFAULT 0,
  journeys_rebuilt  INT NOT NULL DEFAULT 0,
  error_text        TEXT NULL,
  requested_by      INT UNSIGNED NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at        DATETIME NULL,
  finished_at       DATETIME NULL,
  KEY ix_imports_created (created_at),
  CONSTRAINT fk_imports_user FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Raw report 540 rows: one row per contact leg.
CREATE TABLE contact_legs (
  contact_id         BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  master_contact_id  BIGINT UNSIGNED NOT NULL,     -- parent leg (self on first leg)
  contact_code       BIGINT NULL,
  media_name         VARCHAR(100) NULL,
  contact_name       VARCHAR(255) NULL,
  ani_dialnum        VARCHAR(64) NULL,             -- caller number: personal data, never log
  skill_no           BIGINT NULL,
  skill_name         VARCHAR(255) NULL,
  campaign_no        BIGINT NULL,
  campaign_name      VARCHAR(255) NULL,
  agent_no           BIGINT NULL,
  agent_name         VARCHAR(255) NULL,
  team_no            BIGINT NULL,
  team_name          VARCHAR(255) NULL,
  sla                TINYINT NULL,
  start_local        DATETIME NOT NULL,            -- Australia/Sydney
  start_utc          DATETIME NOT NULL,
  pre_queue          INT NOT NULL DEFAULT 0,
  in_queue           INT NOT NULL DEFAULT 0,
  agent_time         INT NOT NULL DEFAULT 0,
  post_queue         INT NOT NULL DEFAULT 0,
  acw_time           INT NOT NULL DEFAULT 0,
  total_time         INT NOT NULL DEFAULT 0,       -- Total_Time_Plus_Disposition
  abandon_time       INT NOT NULL DEFAULT 0,
  routing_time       INT NOT NULL DEFAULT 0,
  abandon            CHAR(1) NOT NULL DEFAULT 'N',
  callback_time      INT NOT NULL DEFAULT 0,
  logged             CHAR(1) NULL,
  hold_time          INT NOT NULL DEFAULT 0,
  disp_code          BIGINT NULL,
  disp_name          VARCHAR(255) NULL,
  disp_comments      TEXT NULL,
  tags               TEXT NULL,
  -- derived during journey rebuild
  journey_id         BIGINT UNSIGNED NULL,         -- root leg's contact_id
  leg_seq            INT NULL,                     -- 1 = first leg
  has_next_leg       TINYINT(1) NOT NULL DEFAULT 0,
  import_id          INT UNSIGNED NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_legs_master (master_contact_id),
  KEY ix_legs_journey (journey_id),
  KEY ix_legs_start (start_local),
  CONSTRAINT fk_legs_import FOREIGN KEY (import_id) REFERENCES imports(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One row per call journey (legs stitched via master_contact_id). Metrics query this table.
CREATE TABLE journeys (
  journey_id                    BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  start_local                   DATETIME NOT NULL,   -- first leg, Australia/Sydney
  start_utc                     DATETIME NOT NULL,
  leg_count                     INT NOT NULL,
  transfer_count                INT NOT NULL,        -- leg_count - 1
  sum_pre_queue                 INT NOT NULL DEFAULT 0,
  sum_in_queue                  INT NOT NULL DEFAULT 0,
  sum_agent_time                INT NOT NULL DEFAULT 0,
  sum_post_queue                INT NOT NULL DEFAULT 0,
  sum_post_queue_excl_transfer  INT NOT NULL DEFAULT 0,  -- PostQueue only from legs with no next leg
  sum_acw                       INT NOT NULL DEFAULT 0,
  sum_hold                      INT NOT NULL DEFAULT 0,
  sum_abandon_time              INT NOT NULL DEFAULT 0,
  sum_routing_time              INT NOT NULL DEFAULT 0,
  sum_total                     INT NOT NULL DEFAULT 0,
  abandoned_final               CHAR(1) NOT NULL DEFAULT 'N',  -- last leg abandoned
  abandoned_any                 CHAR(1) NOT NULL DEFAULT 'N',  -- any leg abandoned
  first_skill_no                BIGINT NULL,
  first_skill_name              VARCHAR(255) NULL,
  last_skill_name               VARCHAR(255) NULL,
  last_agent_name               VARCHAR(255) NULL,
  final_disp_name               VARCHAR(255) NULL,
  first_sla                     TINYINT NULL,
  updated_at                    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_journeys_start (start_local)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Chart/metric definitions created in the Metric Builder (see docs/metric-dsl.md).
CREATE TABLE metrics (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(150) NOT NULL,
  description  TEXT NULL,
  definition   JSON NOT NULL,
  chart_type   ENUM('bar','line') NOT NULL DEFAULT 'line',
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  created_by   INT UNSIGNED NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_metrics_name (name),
  CONSTRAINT fk_metrics_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
