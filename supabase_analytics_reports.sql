-- =====================================================================
--  MLRS — Smart Analytics report storage
--
--  PostgreSQL, for Supabase. Paste into the SQL editor and run.
--  Safe to re-run: every statement is IF NOT EXISTS or OR REPLACE, and
--  nothing here drops a table or deletes a row.
--
--  Two tables:
--
--    analytics_reports          one row per generated report
--    analytics_anomaly_reviews  an officer's verdict on one anomaly
--
--  The second exists separately on purpose. Re-running the analysis
--  regenerates the anomaly list; if the verdicts lived inside the report
--  snapshot, every regeneration would wipe work an officer had already
--  done. Keyed by the anomaly's identity rather than its position, so a
--  verdict survives the list being reordered.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. The reports
--
--  DRAFT is working state and may be rebuilt freely. FINAL freezes
--  data_snapshot and text_inputs so that reprinting a report that has
--  gone to the Director General gives back exactly what was sent — not
--  today's recomputation of the same period.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  period_type     TEXT NOT NULL CHECK (period_type IN ('MONTH', 'QUARTER', 'SEMESTER', 'YEAR')),
  -- 2026-10 | 2026-Q4 | 2026-S2 | 2026
  period_key      TEXT NOT NULL,

  -- Allocated when the report is approved, never to a draft.
  report_no       TEXT UNIQUE,

  -- Every computed figure, exactly as the Word file was filled from it.
  data_snapshot   JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- What the analyst typed or corrected: the Khmer narrative and the
  -- officer fields. Kept apart from the computed figures so a rebuild of
  -- a draft does not discard the writing.
  text_inputs     JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Which model versions produced the snapshot, for later questions
  -- about why a figure was what it was.
  model_versions  JSONB NOT NULL DEFAULT '{}'::JSONB,

  analyst           TEXT,
  analyst_position  TEXT,
  reviewer          TEXT,
  reviewer_position TEXT,

  status          TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINAL')),

  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by    TEXT,
  finalised_at    TIMESTAMPTZ,
  finalised_by    TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One draft per period. A second draft of the same period would be two
-- people writing different reports about the same months.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_analytics_draft
  ON analytics_reports (period_type, period_key)
  WHERE status = 'DRAFT';

CREATE INDEX IF NOT EXISTS idx_analytics_period
  ON analytics_reports (period_type, period_key, status);
CREATE INDEX IF NOT EXISTS idx_analytics_generated
  ON analytics_reports (generated_at DESC);

COMMENT ON COLUMN analytics_reports.data_snapshot IS
  'Frozen at FINAL. A reprint must give back what was sent, not a fresh computation.';


-- ---------------------------------------------------------------------
--  2. Officer verdicts on anomalies
--
--  An anomaly is a signal to check, never a finding. Only an NMC officer
--  moves it off រង់ចាំពិនិត្យ, and who did so is recorded.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_anomaly_reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  period_type    TEXT NOT NULL CHECK (period_type IN ('MONTH', 'QUARTER', 'SEMESTER', 'YEAR')),
  period_key     TEXT NOT NULL,
  -- Stable identity of the anomaly: its type and subject, not its row
  -- number, so a verdict survives the list being regenerated or reordered.
  anomaly_key    TEXT NOT NULL,

  review_status  TEXT NOT NULL
                   CHECK (review_status IN ('រង់ចាំពិនិត្យ', 'បានផ្ទៀងផ្ទាត់ – ពិត', 'មិនពិត')),
  note           TEXT,

  reviewed_by    TEXT,
  reviewed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_analytics_anomaly
  ON analytics_anomaly_reviews (period_type, period_key, anomaly_key);


-- ---------------------------------------------------------------------
--  3. Access
--
--  Service role only, exactly like ml_lifecycle. Staff reach these
--  through the Express API, which checks the role; the browser never
--  queries them directly. Enabling RLS with no policy denies anon and
--  authenticated by default, which is the intent.
-- ---------------------------------------------------------------------
ALTER TABLE analytics_reports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_anomaly_reviews  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON analytics_reports         FROM anon, authenticated;
REVOKE ALL ON analytics_anomaly_reviews FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON analytics_reports         TO service_role;
GRANT SELECT, INSERT, UPDATE ON analytics_anomaly_reviews TO service_role;


-- ---------------------------------------------------------------------
--  4. updated_at
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_analytics_reports ON analytics_reports;
CREATE TRIGGER trg_touch_analytics_reports
  BEFORE UPDATE ON analytics_reports
  FOR EACH ROW EXECUTE FUNCTION analytics_touch_updated_at();

-- =====================================================================
--  DONE. Check:
--    SELECT table_name FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name LIKE 'analytics%';
--  Then reload the Supabase schema cache.
-- =====================================================================
