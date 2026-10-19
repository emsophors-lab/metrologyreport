-- =====================================================================
--  MLRS — Annex 8 monthly report: the whole schema, for Supabase
--
--  WHAT THIS IS
--  PostgreSQL. Supabase runs PostgreSQL, not MySQL — paste this into the
--  Supabase SQL editor (Database -> SQL Editor -> New query) and run it.
--  If you want the MySQL version, for MISTI's own server, that is a
--  different file: mysql/01_schema.sql plus mysql/02_functions_views.sql.
--
--  It creates everything the new monthly report needs: the licence
--  reference tables, the report header, the four entry tables, carry-over,
--  drafts, report numbering, the audit log, the Part 2 totals function, the
--  Article 21 deadline functions, the dashboard view, the official-document
--  columns and the Telegram digest log.
--
--  SAFE TO RE-RUN. Every statement is IF NOT EXISTS, CREATE OR REPLACE or
--  guarded. Running it twice changes nothing the second time, and running it
--  on a database that already has some of these tables fills in the rest.
--
--  IT DOES NOT TOUCH YOUR EXISTING DATA. No table is dropped and no row is
--  deleted. The only thing it writes to an existing table is one column on
--  the legacy `reports` table (format_version = 'LEGACY-1'), to tell the two
--  generations apart — and only if that table exists.
--
--  ORDER MATTERS. The sections below must run in the order given; later ones
--  alter what earlier ones create. Running the whole file in one go does
--  that for you.
--
--  AFTER RUNNING: Supabase caches the schema. Reload it from
--  Project Settings -> API -> "Reload schema cache", or just wait a minute.
--
--  Generated from the five migrations in this repository, which are the
--  source of truth:
--    supabase_annex8_schema.sql
--    supabase_annex8_incremental_entry.sql
--    supabase_annex8_official_documents.sql
--    supabase_annex8_report_storage.sql
--    supabase_annex8_monthly_digest.sql
-- =====================================================================

-- #####################################################################
--  SECTION 1 — LICENCE DATA, REPORT HEADER AND ENTRY TABLES
--  from supabase_annex8_schema.sql
-- #####################################################################

-- =====================================================================
--  ANNEX 8 (A8-2026.2) — MONTHLY REPORT SCHEMA
--  Metrology License Report System (MLRS) · National Metrology Center
--
--  Run this in the Supabase SQL Editor, then refresh the schema cache.
--
--  LEGACY IS FROZEN. The existing `reports` table is NOT touched by this
--  migration. Annex 8 lives in its own `annex8_*` tables, so every report
--  already submitted stays readable exactly as it is. Old rows are tagged
--  with their format version at the bottom of this file.
--
--  Shape change: the legacy `reports` table holds ONE SERVICE EVENT per row.
--  Annex 8 holds ONE REPORT PER LICENCE PER MONTH, with child rows for
--  Part 3 (instruments), Part 3A (modules), Part 4 (repairs) and Part 5
--  (standards). Part 2 is a computed snapshot, never accepted from a client.
-- =====================================================================

-- =====================================================================
--  1. LICENCE PREREQUISITES
--     Annex 8 pre-fill needs licence type, authorised categories,
--     registered technicians and registered standards. None of these
--     exist in the current schema, and without them V06 (category within
--     licence scope), Part 4's technician field and all of Part 5 have no
--     source of truth.
-- =====================================================================

CREATE TABLE IF NOT EXISTS annex8_licence_profiles (
  license_number      TEXT PRIMARY KEY,
  licence_type        TEXT NOT NULL DEFAULT 'MANUF_INSTALL'
                        CHECK (licence_type IN ('MANUF_INSTALL', 'REPAIR')),
  registration_no     TEXT,                 -- Metrology registration certificate No. (Art. 7)
  decision_no         TEXT,                 -- សេចក្ដីសម្រេចលេខ
  decision_date       DATE,
  operating_address   TEXT,
  contact_name        TEXT,
  contact_position    TEXT,
  contact_phone       TEXT,
  contact_email       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categories authorised on the licence. Drives V06.
CREATE TABLE IF NOT EXISTS annex8_licence_scope (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_number TEXT NOT NULL,
  category_code  TEXT NOT NULL CHECK (category_code IN (
                   'NAWI','WEIGHBRIDGE','WEIGHTS','FUEL_DISPENSER','LPG_DISPENSER',
                   'ELEC_METER','WATER_METER','EV_CHARGER','OTHER')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (license_number, category_code)
);

-- Registered technicians (Art. 9, 18) — the Part 4 technician dropdown.
CREATE TABLE IF NOT EXISTS annex8_licence_technicians (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_number TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  position       TEXT,
  id_card_no     TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registered measurement standards (Art. 23) — seeds Part 5.
CREATE TABLE IF NOT EXISTS annex8_licence_standards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_number TEXT NOT NULL,
  equipment      TEXT NOT NULL,
  serial_no      TEXT,
  class_range    TEXT,
  cal_cert_no    TEXT,
  lab            TEXT,
  cal_date       DATE,
  due_date       DATE,
  status         TEXT NOT NULL DEFAULT 'VALID'
                   CHECK (status IN ('VALID', 'EXPIRED', 'OUT_OF_SERVICE')),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a8_scope_licence       ON annex8_licence_scope (license_number);
CREATE INDEX IF NOT EXISTS idx_a8_technicians_licence ON annex8_licence_technicians (license_number);
CREATE INDEX IF NOT EXISTS idx_a8_standards_licence   ON annex8_licence_standards (license_number);

-- =====================================================================
--  2. MONTHLY REPORT HEADER  (cover letter + Part 1 + Part 2 snapshot)
-- =====================================================================

CREATE TABLE IF NOT EXISTS annex8_reports (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Public receipt number: NMC-RPT-YYYYMM-##### (Art. 21). NULL while DRAFT.
  report_id            TEXT UNIQUE,
  format_version       TEXT NOT NULL DEFAULT 'A8-2026.2',

  -- Part 1 — licensee snapshot, copied in at submit so the report stays
  -- readable even if the licence record changes later.
  licence_no           TEXT NOT NULL,
  user_id              TEXT,
  licence_type         TEXT NOT NULL DEFAULT 'MANUF_INSTALL'
                         CHECK (licence_type IN ('MANUF_INSTALL', 'REPAIR')),
  enterprise_name_kh   TEXT,
  enterprise_name_en   TEXT,
  registration_no      TEXT,
  licence_valid_to     DATE,
  operating_address    TEXT,

  period_month         TEXT NOT NULL,           -- YYYY-MM
  report_type          TEXT NOT NULL DEFAULT 'REGULAR'
                         CHECK (report_type IN ('REGULAR', 'NIL', 'AMENDMENT')),
  -- An amendment links to the original; the original is never overwritten.
  original_report_id   TEXT,

  contact_name         TEXT,
  contact_position     TEXT,
  contact_phone        TEXT,
  contact_email        TEXT,

  -- Part 2 — computed server-side from Parts 3 and 4 on submit.
  -- Never written from a client payload.
  part2_summary        JSONB,
  -- Part 6 — the six yes/no items and their details.
  events               JSONB,
  -- Non-blocking validation findings (V07 – V11) stored with the report.
  warnings             JSONB,

  declaration_accepted BOOLEAN NOT NULL DEFAULT FALSE,

  status               TEXT NOT NULL DEFAULT 'DRAFT'
                         CHECK (status IN ('DRAFT', 'SUBMITTED', 'RETURNED', 'ACCEPTED')),
  on_time              BOOLEAN,                 -- server-computed, never trusted from a client
  submitted_at         TIMESTAMPTZ,
  submitted_by         TEXT,

  -- NMC back office ("For NMC Use Only" block on the paper form)
  received_at          TIMESTAMPTZ,
  reviewer             TEXT,
  nmc_remarks          TEXT,
  is_complete          BOOLEAN,

  verification_token_hash TEXT,                 -- public QR verification

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One submitted regular/nil report per licence per month. Amendments are
-- excluded because they intentionally repeat a period, and drafts are
-- excluded so a draft never blocks the real submission.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_a8_report_period
  ON annex8_reports (licence_no, period_month)
  WHERE report_type <> 'AMENDMENT' AND status <> 'DRAFT';

CREATE INDEX IF NOT EXISTS idx_a8_reports_licence ON annex8_reports (licence_no);
CREATE INDEX IF NOT EXISTS idx_a8_reports_period  ON annex8_reports (period_month);
CREATE INDEX IF NOT EXISTS idx_a8_reports_status  ON annex8_reports (status);

-- =====================================================================
--  3. PART 3 — INSTRUMENTS MANUFACTURED OR INSTALLED
-- =====================================================================

CREATE TABLE IF NOT EXISTS annex8_report_instruments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_uuid          UUID NOT NULL REFERENCES annex8_reports(id) ON DELETE CASCADE,
  row_no               INTEGER NOT NULL DEFAULT 1,

  op_code              TEXT NOT NULL CHECK (op_code IN ('M', 'I')),   -- ផ / ដ
  category             TEXT NOT NULL,
  category_other       TEXT,
  instrument_name      TEXT NOT NULL,
  model                TEXT,
  serial_no            TEXT NOT NULL,
  manufacturer         TEXT,
  country              TEXT,

  -- Metrological characteristics (Art. 18). e is the verification scale
  -- interval, NOT the resolution d.
  max_capacity         TEXT,
  min_capacity         TEXT,
  e_value              TEXT,
  unit                 TEXT,
  accuracy_class       TEXT,
  type_approval_no     TEXT,

  completion_date      DATE,
  customer_name        TEXT,
  province             TEXT,
  address              TEXT,
  latitude             NUMERIC(10, 7),
  longitude            NUMERIC(10, 7),
  label_qr_no          TEXT,

  verification_status  TEXT NOT NULL DEFAULT 'PENDING'
                         CHECK (verification_status IN ('PASSED', 'FAILED', 'PENDING')),
  verification_cert_no TEXT,
  verification_date    DATE,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a8_instr_report ON annex8_report_instruments (report_uuid);
CREATE INDEX IF NOT EXISTS idx_a8_instr_serial ON annex8_report_instruments (serial_no);
CREATE INDEX IF NOT EXISTS idx_a8_instr_label  ON annex8_report_instruments (label_qr_no);
-- Carry-over lookup: PENDING items from earlier months (Art. 17).
CREATE INDEX IF NOT EXISTS idx_a8_instr_pending
  ON annex8_report_instruments (verification_status) WHERE verification_status = 'PENDING';

-- =====================================================================
--  4. PART 3A — METROLOGICALLY RELEVANT MODULES / SPARE PARTS
--     Linked to its host by serial number within the same report (V02).
-- =====================================================================

CREATE TABLE IF NOT EXISTS annex8_report_modules (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_uuid        UUID NOT NULL REFERENCES annex8_reports(id) ON DELETE CASCADE,
  row_no             INTEGER NOT NULL DEFAULT 1,

  host_serial_no     TEXT NOT NULL,
  host_part          TEXT CHECK (host_part IN ('P3', 'P4')),
  module_name        TEXT NOT NULL,
  model              TEXT,
  serial_no          TEXT,
  range_e            TEXT,
  manufacturer       TEXT,
  country            TEXT,
  cert_no            TEXT,
  -- REPLACEMENT is only valid for a Part 4 (repair) host.
  new_or_replacement TEXT NOT NULL DEFAULT 'NEW'
                       CHECK (new_or_replacement IN ('NEW', 'REPLACEMENT')),

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a8_mod_report ON annex8_report_modules (report_uuid);
CREATE INDEX IF NOT EXISTS idx_a8_mod_host   ON annex8_report_modules (host_serial_no);

-- =====================================================================
--  5. PART 4 — REPAIRS
-- =====================================================================

CREATE TABLE IF NOT EXISTS annex8_report_repairs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_uuid          UUID NOT NULL REFERENCES annex8_reports(id) ON DELETE CASCADE,
  row_no               INTEGER NOT NULL DEFAULT 1,

  category             TEXT NOT NULL,
  instrument_name      TEXT NOT NULL,
  model                TEXT,
  serial_no            TEXT NOT NULL,
  customer_name        TEXT,
  province             TEXT,
  address              TEXT,
  latitude             NUMERIC(10, 7),
  longitude            NUMERIC(10, 7),

  repair_from          DATE,
  repair_to            DATE,
  repair_description   TEXT,

  -- Art. 25: removing a seal requires an Annex 10 notification (V03).
  seal_broken          BOOLEAN NOT NULL DEFAULT FALSE,
  seal_removed_no      TEXT,
  notification_no      TEXT,

  technician           TEXT,

  verification_status  TEXT NOT NULL DEFAULT 'PENDING'
                         CHECK (verification_status IN ('PASSED', 'FAILED', 'PENDING')),
  verification_cert_no TEXT,
  verification_date    DATE,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a8_rep_report ON annex8_report_repairs (report_uuid);
CREATE INDEX IF NOT EXISTS idx_a8_rep_serial ON annex8_report_repairs (serial_no);
CREATE INDEX IF NOT EXISTS idx_a8_rep_pending
  ON annex8_report_repairs (verification_status) WHERE verification_status = 'PENDING';

-- =====================================================================
--  6. PART 5 — MEASUREMENT STANDARDS & TEST EQUIPMENT (changes this month)
-- =====================================================================

CREATE TABLE IF NOT EXISTS annex8_report_standards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_uuid  UUID NOT NULL REFERENCES annex8_reports(id) ON DELETE CASCADE,
  row_no       INTEGER NOT NULL DEFAULT 1,

  equipment    TEXT NOT NULL,
  serial_no    TEXT,
  class_range  TEXT,
  cal_cert_no  TEXT,
  lab          TEXT,
  cal_date     DATE,
  due_date     DATE,
  status       TEXT NOT NULL DEFAULT 'VALID'
                 CHECK (status IN ('VALID', 'EXPIRED', 'OUT_OF_SERVICE')),

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a8_std_report ON annex8_report_standards (report_uuid);

-- =====================================================================
--  7. CARRY-OVER UPDATES
--     A PENDING item from an earlier month resurfaces for its verification
--     result to be updated. The update is recorded here AND applied to the
--     originating row, so the original stops being PENDING.
-- =====================================================================

CREATE TABLE IF NOT EXISTS annex8_carry_over_updates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_uuid        UUID NOT NULL REFERENCES annex8_reports(id) ON DELETE CASCADE,
  source_part        TEXT NOT NULL CHECK (source_part IN ('P3', 'P4')),
  source_row_id      UUID,          -- row in annex8_report_instruments / _repairs
  source_report_id   TEXT,
  serial_no          TEXT,
  new_status         TEXT NOT NULL CHECK (new_status IN ('PASSED', 'FAILED', 'PENDING')),
  cert_no            TEXT,
  verification_date  DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a8_carry_report ON annex8_carry_over_updates (report_uuid);

-- =====================================================================
--  8. SERVER-SIDE DRAFTS
--     Replaces the browser localStorage draft so a report can be continued
--     on another device. One draft per licence per month.
-- =====================================================================

CREATE TABLE IF NOT EXISTS annex8_report_drafts (
  licence_no   TEXT NOT NULL,
  period_month TEXT NOT NULL,
  payload      JSONB NOT NULL,
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (licence_no, period_month)
);

-- =====================================================================
--  9. REPORT NUMBER SEQUENCE  —  NMC-RPT-YYYYMM-#####
--     Allocated atomically so two concurrent submissions cannot collide.
-- =====================================================================

CREATE TABLE IF NOT EXISTS annex8_report_counters (
  period_month TEXT PRIMARY KEY,
  last_value   INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION annex8_next_report_id(p_period TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  next_val INTEGER;
BEGIN
  INSERT INTO annex8_report_counters (period_month, last_value)
  VALUES (p_period, 1)
  ON CONFLICT (period_month)
  DO UPDATE SET last_value = annex8_report_counters.last_value + 1
  RETURNING last_value INTO next_val;

  RETURN 'NMC-RPT-' || REPLACE(p_period, '-', '') || '-' || LPAD(next_val::TEXT, 5, '0');
END;
$$;

-- =====================================================================
--  10. updated_at MAINTENANCE
-- =====================================================================

CREATE OR REPLACE FUNCTION annex8_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'annex8_reports', 'annex8_report_instruments', 'annex8_report_repairs',
    'annex8_licence_profiles', 'annex8_licence_technicians', 'annex8_licence_standards'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION annex8_touch_updated_at()', t);
  END LOOP;
END $$;

-- =====================================================================
--  11. ROW LEVEL SECURITY
--     All writes go through the Express API with the service role key,
--     which bypasses RLS. These policies govern the browser's anon client
--     only: it may read, but never write.
-- =====================================================================

ALTER TABLE annex8_reports               ENABLE ROW LEVEL SECURITY;
ALTER TABLE annex8_report_instruments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE annex8_report_modules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE annex8_report_repairs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE annex8_report_standards      ENABLE ROW LEVEL SECURITY;
ALTER TABLE annex8_carry_over_updates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE annex8_report_drafts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE annex8_licence_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE annex8_licence_scope         ENABLE ROW LEVEL SECURITY;
ALTER TABLE annex8_licence_technicians   ENABLE ROW LEVEL SECURITY;
ALTER TABLE annex8_licence_standards     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'annex8_reports', 'annex8_report_instruments', 'annex8_report_modules',
    'annex8_report_repairs', 'annex8_report_standards', 'annex8_carry_over_updates',
    'annex8_report_drafts', 'annex8_licence_profiles', 'annex8_licence_scope',
    'annex8_licence_technicians', 'annex8_licence_standards'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "a8 read" ON %I', t);
    EXECUTE format('CREATE POLICY "a8 read" ON %I FOR SELECT USING (true)', t);
  END LOOP;
END $$;

-- =====================================================================
--  12. LEGACY TAGGING
--     Mark everything already in `reports` with its format version so the
--     two generations can be told apart in dashboards and exports.
--     The legacy rows themselves are left exactly as they are.
-- =====================================================================

DO $legacy$
BEGIN
  IF to_regclass('public.reports') IS NOT NULL THEN
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS format_version TEXT;
    UPDATE reports SET format_version = 'LEGACY-1' WHERE format_version IS NULL;
  END IF;
END $legacy$;

-- =====================================================================
--  13. DASHBOARD UNION VIEW
--     One row per service event across both generations, so existing
--     aggregates (by category, by province, counts) keep working while
--     Annex 8 reports accumulate.
-- =====================================================================

-- (The dashboard union view is created once, in section 8 below, in its
--  final form. The older two-status definition that used to live here has
--  been left out so it is not created and immediately replaced.)

-- =====================================================================
--  DONE. Refresh the Supabase schema cache after running this file.
-- =====================================================================


-- #####################################################################
--  SECTION 2 — INCREMENTAL ENTRY: OPEN months, soft delete, audit log
--  from supabase_annex8_incremental_entry.sql
-- #####################################################################

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

-- The first branch of this view reads the legacy `reports` table. On a
-- Supabase project that has never held the old flat report, that table does
-- not exist, so the view is built without it rather than failing.
DO $guard$
BEGIN
  IF to_regclass('public.reports') IS NOT NULL THEN
    EXECUTE $viewsql$
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
$viewsql$;
  ELSE
    EXECUTE $viewsql$
CREATE OR REPLACE VIEW annex8_activity_union AS
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
$viewsql$;
  END IF;
END $guard$;


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


-- #####################################################################
--  SECTION 3 — OFFICIAL DOCUMENT COLUMNS
--  from supabase_annex8_official_documents.sql
-- #####################################################################

-- =====================================================================
--  ANNEX 8 — OFFICIAL DOCUMENT RENDERING
--
--  Run AFTER supabase_annex8_schema.sql.
--
--  The official record of a submitted report is the DOCX produced by
--  filling templates/Annex8_template_v1.docx, and the PDF converted from
--  it. Both are generated once at submission and served unchanged
--  afterwards, so a report can never silently re-render differently from
--  what the licensee signed and NMC received.
-- =====================================================================

-- Which template filled this report. Old reports must keep rendering with
-- the template version they were submitted under, even after v2 lands.
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS template_version TEXT NOT NULL DEFAULT 'v1';

-- Stored official documents. Paths point at the storage bucket; the
-- checksum lets us prove the served file is the one generated at submit.
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_docx_path   TEXT;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_pdf_path    TEXT;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_docx_sha256 TEXT;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_pdf_sha256  TEXT;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_rendered_at TIMESTAMPTZ;
-- Set when PDF conversion failed at submit, so a retry can find it.
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_render_error TEXT;

CREATE INDEX IF NOT EXISTS idx_a8_reports_template_version
  ON annex8_reports (template_version);
CREATE INDEX IF NOT EXISTS idx_a8_reports_render_pending
  ON annex8_reports (id) WHERE official_pdf_path IS NULL AND status <> 'DRAFT';

-- Licence fields the cover letter needs that the licence record does not
-- carry yet. decision_no / decision_date already exist in
-- annex8_licence_profiles; the legal representative signs the declaration.
ALTER TABLE annex8_licence_profiles ADD COLUMN IF NOT EXISTS legal_rep_name     TEXT;
ALTER TABLE annex8_licence_profiles ADD COLUMN IF NOT EXISTS legal_rep_position TEXT;

COMMENT ON COLUMN annex8_reports.template_version IS
  'Template used to render this report. Render old reports with their own version.';
COMMENT ON COLUMN annex8_reports.official_pdf_sha256 IS
  'Checksum of the PDF generated at submission; the served file must match.';


-- #####################################################################
--  SECTION 4 — DOCUMENT STORAGE COLUMNS AND BUCKET NOTES
--  from supabase_annex8_report_storage.sql
-- #####################################################################

-- =====================================================================
--  ANNEX 8 — PRIVATE STORAGE BUCKET FOR OFFICIAL DOCUMENTS
--
--  Run AFTER supabase_annex8_official_documents.sql.
--
--  The official DOCX/PDF of a submitted report are generated once at
--  submission and kept in a PRIVATE bucket. Nothing is served from a
--  public storage URL: every download goes through
--      GET /api/reports/:id/annex8.docx
--      GET /api/reports/:id/annex8.pdf
--  which checks that the caller is the owner licensee or NMC staff
--  before streaming the stored bytes.
--
--  Object path:  <licence_no>/<YYYY-MM>/<report_id>/<file name>
--  Override the bucket name with the ANNEX8_BUCKET env var if you
--  create it under a different name.
-- =====================================================================

-- ---------------------------------------------------------------------
--  PORTABILITY
--
--  storage.* exists only on Supabase. On a self-hosted Postgres (the
--  planned move to MISTI's internal server) this whole block is skipped
--  and the server keeps the documents on disk or on S3 instead — see
--  ANNEX8_STORAGE_DRIVER in docs/database-portability.md. Everything
--  else in this file is standard PostgreSQL and runs unchanged.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    RAISE NOTICE 'No storage schema: not a Supabase database. Skipping bucket creation — set ANNEX8_STORAGE_DRIVER=fs or s3.';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'annex8-reports',
    'annex8-reports',
    FALSE,                       -- private: no public URL, ever
    52428800,                    -- 50 MB; a 40-instrument annex is well under 2 MB
    ARRAY[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  )
  ON CONFLICT (id) DO UPDATE
    SET public = FALSE,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

  -- No policies are granted to anon or authenticated. Reads and writes happen
  -- only with the service-role key from server.ts, which bypasses RLS, so the
  -- API's own owner-or-NMC-staff check is the single gate on these files.
  -- Dropping any policy an earlier run may have added keeps that true.
  DROP POLICY IF EXISTS "annex8_reports_public_read"        ON storage.objects;
  DROP POLICY IF EXISTS "annex8_reports_authenticated_read" ON storage.objects;
END $$;

-- Columns used by the storage wiring were added in
-- supabase_annex8_official_documents.sql (official_docx_path,
-- official_pdf_path, the two checksums, official_rendered_at,
-- official_render_error). Repeated here as IF NOT EXISTS so this file can be
-- run on a database that only ever received the base Annex 8 schema.
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_docx_path    TEXT;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_pdf_path     TEXT;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_docx_sha256  TEXT;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_pdf_sha256   TEXT;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_rendered_at  TIMESTAMPTZ;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_render_error TEXT;

COMMENT ON COLUMN annex8_reports.official_pdf_path IS
  'Object path inside the private annex8-reports bucket. Never a public URL.';


-- #####################################################################
--  SECTION 5 — MONTHLY TELEGRAM DIGEST LOG
--  from supabase_annex8_monthly_digest.sql
-- #####################################################################

-- =====================================================================
--  ANNEX 8 — MONTHLY COMPLIANCE DIGEST
--
--  Run AFTER supabase_annex8_schema.sql.
--
--  Once a month the system totals up which licensed enterprises filed
--  their Annex 8 report with NMC and posts the result to the NMC
--  Telegram group:
--
--      POST /api/monthly-report-digest     (Vercel cron, day 8)
--
--  Day 8 is the morning after the ប្រការ២១ deadline on day 7, so the
--  first figure NMC sees is the final one for that month.
--
--  This table is both the audit trail and the guard against a repeat
--  post: a period that already has a 'Sent' row is not sent again
--  unless the endpoint is called with force=1.
-- =====================================================================

CREATE TABLE IF NOT EXISTS monthly_report_digest_logs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The month being reported on, YYYY-MM (not the month it was sent).
  period_month             TEXT NOT NULL,

  telegram_bot_setting_id  UUID,
  telegram_chat_id         TEXT,

  -- The headline numbers as they stood when the digest was sent, kept so
  -- a later query cannot silently rewrite history.
  licensee_count           INTEGER NOT NULL DEFAULT 0,
  submitted_count          INTEGER NOT NULL DEFAULT 0,
  on_time_count            INTEGER NOT NULL DEFAULT 0,
  late_count               INTEGER NOT NULL DEFAULT 0,
  missing_count            INTEGER NOT NULL DEFAULT 0,
  compliance_rate          INTEGER NOT NULL DEFAULT 0,

  -- A long roll call is split across several Telegram messages.
  message_count            INTEGER NOT NULL DEFAULT 1,
  message_text             TEXT,

  send_status              TEXT NOT NULL DEFAULT 'Sent'
                             CHECK (send_status IN ('Sent', 'Failed', 'Skipped')),
  error_message            TEXT,
  sent_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The duplicate guard reads this on every run.
CREATE INDEX IF NOT EXISTS idx_digest_logs_period
  ON monthly_report_digest_logs (period_month, send_status);
CREATE INDEX IF NOT EXISTS idx_digest_logs_sent_at
  ON monthly_report_digest_logs (sent_at DESC);

-- Written only by the server with the service-role key, which bypasses
-- RLS. No anon or authenticated policy is granted: the digest names which
-- enterprises are non-compliant, which is NMC's business and not a
-- licensee's.
ALTER TABLE monthly_report_digest_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE monthly_report_digest_logs IS
  'One row per monthly Telegram compliance digest. A Sent row blocks a repeat post for that period.';
COMMENT ON COLUMN monthly_report_digest_logs.period_month IS
  'The month reported on (YYYY-MM), not the month the message was sent.';


-- #####################################################################
--  DONE.
--
--  Check it worked — this should list 13 tables:
--
--    SELECT table_name FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name LIKE 'annex8%'
--     ORDER BY table_name;
--
--  And these four routines:
--
--    SELECT routine_name FROM information_schema.routines
--     WHERE routine_schema = 'public' AND routine_name LIKE 'annex8%'
--     ORDER BY routine_name;
--
--  Then reload the Supabase schema cache.
-- #####################################################################
