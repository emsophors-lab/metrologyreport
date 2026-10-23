-- =====================================================================
--  MLRS — the AI analyst's work queue (MySQL 8.4)
--
--  The same table as supabase_analytics_narrative_jobs.sql, translated:
--
--    UUID        -> CHAR(36) DEFAULT (UUID())
--    JSONB       -> JSON
--    TIMESTAMPTZ -> DATETIME(3), always written as UTC
--    partial unique index -> a STORED generated column that is NULL when
--      the predicate is false, because MySQL unique indexes ignore NULLs
--
--  Run after 04_analytics_reports.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS analytics_narrative_jobs (
  id                  CHAR(36)     NOT NULL DEFAULT (UUID()),

  period_type         VARCHAR(16)  NOT NULL,
  -- 2026-10 | 2026-Q4 | 2026-S2 | 2026
  period_key          VARCHAR(16)  NOT NULL,

  status              VARCHAR(16)  NOT NULL DEFAULT 'PENDING',

  -- The four Khmer sections the agent wrote, and nothing else from its reply.
  narrative           JSON,
  -- Which model answered; the report names it.
  agent_model         VARCHAR(190),
  -- SHA-256 of the figures the narrative was written against.
  figures_fingerprint VARCHAR(64),

  attempts            INT          NOT NULL DEFAULT 0,
  last_error          TEXT,

  -- A lease rather than a lock: a worker that dies holds the job only
  -- until claimed_until passes.
  claim_token         VARCHAR(64),
  claimed_until       DATETIME(3),

  requested_by        VARCHAR(190),
  requested_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at         DATETIME(3),
  updated_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                        ON UPDATE CURRENT_TIMESTAMP(3),

  -- PostgreSQL's "UNIQUE (period_type, period_key) WHERE status IN
  -- ('PENDING','RUNNING')". NULL once the job finishes, and MySQL unique
  -- indexes ignore NULLs, so the rule covers exactly the same rows.
  uniq_live_key CHAR(40) GENERATED ALWAYS AS (
    CASE WHEN status IN ('PENDING', 'RUNNING')
         THEN CONCAT(period_type, '|', period_key) END) STORED,

  PRIMARY KEY (id),
  UNIQUE KEY uniq_analytics_narrative_live (uniq_live_key),
  KEY idx_analytics_narrative_period (period_type, period_key, status),
  KEY idx_analytics_narrative_queue (status, requested_at),
  KEY idx_analytics_narrative_finished (finished_at DESC),

  CONSTRAINT chk_analytics_narrative_period_type
    CHECK (period_type IN ('MONTH', 'QUARTER', 'SEMESTER', 'YEAR')),
  CONSTRAINT chk_analytics_narrative_status
    CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'FAILED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
