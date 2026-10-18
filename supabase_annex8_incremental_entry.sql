-- =====================================================================
--  ANNEX 8 — INCREMENTAL MONTHLY ENTRY
--
--  Run AFTER supabase_annex8_schema.sql and
--  supabase_annex8_official_documents.sql.
--
--  Until now a month in progress lived as one JSONB blob in
--  annex8_report_drafts, and the entry rows were created only at the
--  moment of submission. That made it impossible to add work across
--  several sessions: saving from a second device replaced the whole
--  month instead of merging, and there was no entry to edit, duplicate
--  or delete.
--
--  After this migration a month in progress is a real report row with
--  status OPEN, and every entry is a real row from the moment it is
--  typed. annex8_report_drafts keeps one much smaller job: autosaving
--  the single entry form a user currently has open.
--
--  Decisions this migration implements (agreed 2026-10-18):
--    * extend the existing annex8_* tables, do not rename them
--    * access is enforced by the API, not by RLS  (option (a))
--    * Part 6 stays a JSONB column, no report_events table
--    * OPEN is added to the status constraint; DRAFT stays valid
--    * an entry belongs to the month of its ACTIVITY date
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. OPEN — a month being filled in
-- ---------------------------------------------------------------------

-- DRAFT is kept so nothing already stored becomes invalid; it is simply
-- no longer written by the application.
DO $$
DECLARE c TEXT;
BEGIN
  SELECT con.conname INTO c
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'annex8_reports'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%'
    AND pg_get_constraintdef(con.oid) ILIKE '%SUBMITTED%';

  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE annex8_reports DROP CONSTRAINT %I', c);
  END IF;
END $$;

-- Named drop as well, so re-running this file is safe.
ALTER TABLE annex8_reports DROP CONSTRAINT IF EXISTS annex8_reports_status_check;

ALTER TABLE annex8_reports
  ADD CONSTRAINT annex8_reports_status_check
  CHECK (status IN ('OPEN', 'DRAFT', 'SUBMITTED', 'RETURNED', 'ACCEPTED'));

ALTER TABLE annex8_reports ALTER COLUMN status SET DEFAULT 'OPEN';

-- Who opened the month, and the return trail. The return comment reuses
-- the existing nmc_remarks rather than adding a second comment column.
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS opened_at   TIMESTAMPTZ;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS opened_by   TEXT;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS returned_by TEXT;

COMMENT ON COLUMN annex8_reports.status IS
  'OPEN = being filled in this month · SUBMITTED/RETURNED/ACCEPTED = with NMC. DRAFT is legacy.';


-- ---------------------------------------------------------------------
--  2. One container per licence per month
--
--  Three separate rules, each a partial unique index:
--    a) one live report per licence per month (amendments excepted)
--    b) one open container per licence per month
--    c) one open amendment per licence per month
--  Without (b) a second device could create a second OPEN month and the
--  entries would silently split across two reports.
-- ---------------------------------------------------------------------

DROP INDEX IF EXISTS uniq_a8_report_period;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_a8_report_period
  ON annex8_reports (licence_no, period_month)
  WHERE report_type <> 'AMENDMENT' AND status NOT IN ('DRAFT', 'OPEN');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_a8_report_open
  ON annex8_reports (licence_no, period_month)
  WHERE report_type <> 'AMENDMENT' AND status IN ('DRAFT', 'OPEN');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_a8_amendment_open
  ON annex8_reports (licence_no, period_month)
  WHERE report_type = 'AMENDMENT' AND status IN ('DRAFT', 'OPEN');

-- The dashboard asks "which month is open for this licence" on every load.
CREATE INDEX IF NOT EXISTS idx_a8_reports_licence_period
  ON annex8_reports (licence_no, period_month, status);


-- ---------------------------------------------------------------------
--  3. Soft delete and attribution on every entry table
--
--  deleted_at drives the ten-second undo. Because it is a column and not
--  a client-side timer, an undo still works after a page reload, and a
--  deleted entry can still be explained in the audit log.
-- ---------------------------------------------------------------------

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'annex8_report_instruments', 'annex8_report_modules',
    'annex8_report_repairs', 'annex8_report_standards'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_by TEXT', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS created_by TEXT', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_by TEXT', t);
    -- _modules and _standards were created without updated_at.
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()', t);

    -- Every list reads one report's live rows in entry order.
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%1$s_live ON %1$s (report_uuid, row_no) WHERE deleted_at IS NULL', t);

    -- updated_at maintenance, matching the trigger the base schema installs.
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION annex8_touch_updated_at()', t);
  END LOOP;
END $$;

COMMENT ON COLUMN annex8_report_instruments.deleted_at IS
  'Soft delete. NULL = live. Every read must filter deleted_at IS NULL.';


-- ---------------------------------------------------------------------
--  4. Audit log
--
--  One row per create, update, delete, undelete, submit, return, accept
--  and amend. Deliberately NOT a foreign key to annex8_reports: if a
--  report were ever removed, the record of who did what to it is exactly
--  the thing that must survive.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS annex8_report_audit_log (
  id           BIGSERIAL PRIMARY KEY,

  report_uuid  UUID,                  -- no FK on purpose, see above
  licence_no   TEXT,
  period_month TEXT,

  -- Which thing changed, and which row of it.
  entity       TEXT NOT NULL
                 CHECK (entity IN ('report', 'instrument', 'module', 'repair',
                                   'standard', 'carry_over', 'events')),
  entity_id    TEXT,

  action       TEXT NOT NULL
                 CHECK (action IN ('create', 'update', 'delete', 'undelete',
                                   'submit', 'return', 'accept', 'amend', 'open')),

  actor        TEXT,
  actor_role   TEXT,

  old_value    JSONB,
  new_value    JSONB,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a8_audit_report
  ON annex8_report_audit_log (report_uuid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_a8_audit_licence
  ON annex8_report_audit_log (licence_no, period_month, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_a8_audit_actor
  ON annex8_report_audit_log (actor, created_at DESC);

COMMENT ON TABLE annex8_report_audit_log IS
  'Who changed what, when. Append-only; nothing in the application updates or deletes a row here.';


-- ---------------------------------------------------------------------
--  5. The entry-form autosave
--
--  annex8_report_drafts no longer holds the month — the OPEN report does.
--  It now holds the single entry form a user has open, so a dropped
--  connection does not lose what they were typing.
-- ---------------------------------------------------------------------

ALTER TABLE annex8_report_drafts ADD COLUMN IF NOT EXISTS draft_kind TEXT NOT NULL DEFAULT 'MONTH';
ALTER TABLE annex8_report_drafts ADD COLUMN IF NOT EXISTS entry_part TEXT;
ALTER TABLE annex8_report_drafts ADD COLUMN IF NOT EXISTS entry_id   TEXT;

COMMENT ON COLUMN annex8_report_drafts.draft_kind IS
  'ENTRY = one unsaved entry form. MONTH = a whole-month payload from before incremental entry; read-only legacy.';


-- ---------------------------------------------------------------------
--  6. Access — option (a): the API decides, not the database
--
--  The browser no longer queries the database at all; every read and
--  write goes through server.ts with the service-role key, which scopes
--  a company account to its own licence. RLS stays ON with NO permissive
--  policy, so the anon key reads nothing even if one leaks.
--
--  Deliberately not auth.uid() policies: those need Supabase GoTrue,
--  which will not exist on MISTI's own PostgreSQL server. See
--  docs/database-portability.md.
--
--  NOTE: this drops the "a8 read" policies the base schema created. Any
--  deployment still running a frontend that reads these tables directly
--  with the anon key will stop seeing data and must be updated first.
-- ---------------------------------------------------------------------

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'annex8_reports', 'annex8_report_instruments', 'annex8_report_modules',
    'annex8_report_repairs', 'annex8_report_standards', 'annex8_carry_over_updates',
    'annex8_report_drafts', 'annex8_licence_profiles', 'annex8_licence_scope',
    'annex8_licence_technicians', 'annex8_licence_standards'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "a8 read" ON %I', t);
  END LOOP;
END $$;

ALTER TABLE annex8_report_audit_log ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
--  7. Keep the search working
--
--  annex8_activity_union must not show entries that were soft-deleted,
--  and must not show a month that is still being filled in: an OPEN
--  report is the licensee's workings, not something NMC has received.
--  Recreated here with the same column list and order as the base schema.
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW annex8_activity_union AS
  SELECT
    'LEGACY-1'                       AS format_version,
    r.id::TEXT                       AS row_id,
    r.license_number                 AS licence_no,
    r.company_name_kh,
    NULL::TEXT                       AS category,
    r.measuring_instrument           AS instrument_name,
    r.instrument_serial_number       AS serial_no,
    r.customer_name,
    NULL::TEXT                       AS province,
    CASE r.service_type
      WHEN 'Manufacture'  THEN 'M'
      WHEN 'Installation' THEN 'I'
      ELSE 'R'
    END                              AS op_code,
    r.service_end_date::TEXT         AS activity_date,
    NULL::TEXT                       AS verification_status,
    r.report_month, r.report_year
  FROM reports r

  UNION ALL

  SELECT
    a.format_version,
    i.id::TEXT,
    a.licence_no,
    a.enterprise_name_kh,
    i.category,
    i.instrument_name,
    i.serial_no,
    i.customer_name,
    i.province,
    i.op_code,
    i.completion_date::TEXT,
    i.verification_status,
    SPLIT_PART(a.period_month, '-', 2),
    SPLIT_PART(a.period_month, '-', 1)
  FROM annex8_report_instruments i
  JOIN annex8_reports a ON a.id = i.report_uuid
  WHERE a.status NOT IN ('DRAFT', 'OPEN')
    AND i.deleted_at IS NULL

  UNION ALL

  SELECT
    a.format_version,
    p.id::TEXT,
    a.licence_no,
    a.enterprise_name_kh,
    p.category,
    p.instrument_name,
    p.serial_no,
    p.customer_name,
    p.province,
    'R',
    p.repair_to::TEXT,
    p.verification_status,
    SPLIT_PART(a.period_month, '-', 2),
    SPLIT_PART(a.period_month, '-', 1)
  FROM annex8_report_repairs p
  JOIN annex8_reports a ON a.id = p.report_uuid
  WHERE a.status NOT IN ('DRAFT', 'OPEN')
    AND p.deleted_at IS NULL;


-- ---------------------------------------------------------------------
--  8. Part 2 totals, computed in the database
--
--  Part 2 is never typed and never taken from a client. This is the one
--  definition of the totals, used for the live summary while a month is
--  open and frozen into part2_summary at submit.
--
--  The row equation the annex requires:
--      manufactured + installed + repaired = passed + failed + pending
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION annex8_part2_totals(p_report_uuid UUID)
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
  WITH rows_all AS (
    SELECT
      i.category,
      CASE WHEN i.op_code = 'M' THEN 1 ELSE 0 END AS m,
      CASE WHEN i.op_code = 'I' THEN 1 ELSE 0 END AS i_,
      0                                           AS r,
      i.verification_status
    FROM annex8_report_instruments i
    WHERE i.report_uuid = p_report_uuid AND i.deleted_at IS NULL

    UNION ALL

    SELECT p.category, 0, 0, 1, p.verification_status
    FROM annex8_report_repairs p
    WHERE p.report_uuid = p_report_uuid AND p.deleted_at IS NULL
  )
  SELECT jsonb_build_object(
    'rows', COALESCE(jsonb_object_agg(category, counts), '{}'::jsonb),
    'total', (
      SELECT jsonb_build_object(
        'manufactured', COALESCE(SUM(m), 0),
        'installed',    COALESCE(SUM(i_), 0),
        'repaired',     COALESCE(SUM(r), 0),
        'passed',       COALESCE(SUM((verification_status = 'PASSED')::INT), 0),
        'failed',       COALESCE(SUM((verification_status = 'FAILED')::INT), 0),
        'pending',      COALESCE(SUM((verification_status = 'PENDING')::INT), 0)
      )
      FROM rows_all
    )
  )
  FROM (
    SELECT category, jsonb_build_object(
      'manufactured', SUM(m),
      'installed',    SUM(i_),
      'repaired',     SUM(r),
      'passed',       SUM((verification_status = 'PASSED')::INT),
      'failed',       SUM((verification_status = 'FAILED')::INT),
      'pending',      SUM((verification_status = 'PENDING')::INT)
    ) AS counts
    FROM rows_all
    WHERE category IS NOT NULL
    GROUP BY category
  ) per_category;
$$;

-- The shape matches the `rows` and `total` of Annex8Summary in
-- src/annex8/types.ts, so the same JSON drives the on-screen summary and the
-- part2_summary snapshot frozen at submit. The snapshot additionally carries
-- the derived fields computeSummary() adds (balanced, provinces, carryOver).
COMMENT ON FUNCTION annex8_part2_totals(UUID) IS
  'Part 2 computed from the live entry rows. Never accept these numbers from a client.';


-- ---------------------------------------------------------------------
--  9. Lateness, decided by the database clock
--
--  Article 21: the report is due by the 7th of the following month,
--  Asia/Phnom_Penh. Computed here so a device with a wrong clock, or a
--  server in UTC, cannot change whether a report counts as on time.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION annex8_deadline(p_period TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ((to_date(p_period || '-01', 'YYYY-MM-DD') + INTERVAL '1 month' + INTERVAL '7 days'
           - INTERVAL '1 second') AT TIME ZONE 'Asia/Phnom_Penh');
$$;

CREATE OR REPLACE FUNCTION annex8_is_on_time(p_period TEXT, p_at TIMESTAMPTZ DEFAULT NOW())
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT p_at <= annex8_deadline(p_period);
$$;

COMMENT ON FUNCTION annex8_is_on_time(TEXT, TIMESTAMPTZ) IS
  'Art. 21 — due by the 7th of the following month, 23:59:59 Asia/Phnom_Penh.';
