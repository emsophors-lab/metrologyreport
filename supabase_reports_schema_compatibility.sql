-- ============================================================================
-- REPORTS TABLE SCHEMA COMPATIBILITY MIGRATION
-- ----------------------------------------------------------------------------
-- The live `reports` table was created from an older schema and is missing the
-- secure-workflow and QR-verification columns that the application writes.
-- Without them every report save fails with PGRST204 "column not found".
--
-- HOW TO RUN:
--   1. Open your Supabase Dashboard -> SQL Editor -> New Query
--   2. Paste this whole file and click Run
--   3. Refresh the application
-- ============================================================================

ALTER TABLE reports ADD COLUMN IF NOT EXISTS report_status TEXT NOT NULL DEFAULT 'Submitted';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS verification_token_hash TEXT;

-- Speed up public QR verification lookups
CREATE INDEX IF NOT EXISTS idx_reports_verification_token_hash
  ON reports (verification_token_hash);

-- Ask PostgREST to reload its schema cache so the new columns are visible
-- to the API immediately (otherwise it can take up to a few minutes).
NOTIFY pgrst, 'reload schema';
