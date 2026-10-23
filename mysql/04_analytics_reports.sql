-- =====================================================================
--  MLRS — Smart Analytics report storage, MySQL
--
--  The MySQL side of supabase_analytics_reports.sql, so the feature works
--  under DB_DRIVER=mysql as well. Same two tables, same rules; the
--  translations are the ones mysql/README.md already explains:
--
--    UUID        -> CHAR(36) DEFAULT (UUID())
--    JSONB       -> JSON
--    TIMESTAMPTZ -> DATETIME(3) holding UTC
--    partial unique index -> STORED generated column that is NULL when
--                            the predicate is false
--
--    mysql -u root mlrs < mysql/04_analytics_reports.sql
-- =====================================================================

USE mlrs;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS analytics_reports (
  id                CHAR(36)     NOT NULL DEFAULT (UUID()),

  period_type       VARCHAR(16)  NOT NULL,
  period_key        VARCHAR(16)  NOT NULL,
  report_no         VARCHAR(64),

  data_snapshot     JSON         NOT NULL,
  text_inputs       JSON         NOT NULL,
  model_versions    JSON         NOT NULL,

  analyst           VARCHAR(190),
  analyst_position  VARCHAR(190),
  reviewer          VARCHAR(190),
  reviewer_position VARCHAR(190),

  status            VARCHAR(16)  NOT NULL DEFAULT 'DRAFT',

  generated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  generated_by      VARCHAR(190),
  finalised_at      DATETIME(3),
  finalised_by      VARCHAR(190),
  updated_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                      ON UPDATE CURRENT_TIMESTAMP(3),

  -- PostgreSQL's "UNIQUE (period_type, period_key) WHERE status='DRAFT'".
  -- NULL for finalised rows, and MySQL unique indexes ignore NULLs, so the
  -- rule applies to exactly the same rows.
  uniq_draft_key CHAR(40) GENERATED ALWAYS AS (
    CASE WHEN status = 'DRAFT' THEN CONCAT(period_type, '|', period_key) END) STORED,

  PRIMARY KEY (id),
  UNIQUE KEY uniq_analytics_report_no (report_no),
  UNIQUE KEY uniq_analytics_draft (uniq_draft_key),
  KEY idx_analytics_period (period_type, period_key, status),
  KEY idx_analytics_generated (generated_at DESC),

  CONSTRAINT chk_analytics_period_type
    CHECK (period_type IN ('MONTH', 'QUARTER', 'SEMESTER', 'YEAR')),
  CONSTRAINT chk_analytics_status
    CHECK (status IN ('DRAFT', 'FINAL'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS analytics_anomaly_reviews (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),

  period_type    VARCHAR(16)  NOT NULL,
  period_key     VARCHAR(16)  NOT NULL,
  -- The anomaly's identity, not its row number, so a verdict survives the
  -- list being regenerated or reordered.
  anomaly_key    VARCHAR(255) NOT NULL,

  review_status  VARCHAR(64)  NOT NULL,
  note           TEXT,

  reviewed_by    VARCHAR(190),
  reviewed_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY uniq_analytics_anomaly (period_type, period_key, anomaly_key),

  CONSTRAINT chk_analytics_review_period
    CHECK (period_type IN ('MONTH', 'QUARTER', 'SEMESTER', 'YEAR')),
  CONSTRAINT chk_analytics_review_status
    CHECK (review_status IN ('រង់ចាំពិនិត្យ', 'បានផ្ទៀងផ្ទាត់ – ពិត', 'មិនពិត'))
) ENGINE=InnoDB;
