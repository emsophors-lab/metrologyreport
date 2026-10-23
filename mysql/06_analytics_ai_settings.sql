-- =====================================================================
--  MLRS — the AI analyst's provider settings (MySQL 8.4)
--
--  The same single-row table as supabase_analytics_ai_settings.sql.
--  See that file for what the key column does and does not protect.
--
--  Run after 05_analytics_narrative_jobs.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS analytics_ai_settings (
  id                 VARCHAR(64)  NOT NULL DEFAULT 'main',

  provider           VARCHAR(32)  NOT NULL DEFAULT 'gemini',
  models             TEXT         NOT NULL,
  api_key_encrypted  TEXT,

  is_active          TINYINT(1)   NOT NULL DEFAULT 0,

  last_test_status   VARCHAR(64),
  last_test_message  TEXT,
  last_tested_at     DATETIME(3),

  updated_by         VARCHAR(190),
  updated_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                       ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  CONSTRAINT chk_analytics_ai_provider
    CHECK (provider IN ('gemini', 'claude', 'openai'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO analytics_ai_settings (id, models) VALUES ('main', '')
  ON DUPLICATE KEY UPDATE id = id;
