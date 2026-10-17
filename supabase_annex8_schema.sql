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

ALTER TABLE reports ADD COLUMN IF NOT EXISTS format_version TEXT;
UPDATE reports SET format_version = 'LEGACY-1' WHERE format_version IS NULL;

-- =====================================================================
--  13. DASHBOARD UNION VIEW
--     One row per service event across both generations, so existing
--     aggregates (by category, by province, counts) keep working while
--     Annex 8 reports accumulate.
-- =====================================================================

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
  WHERE a.status <> 'DRAFT'

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
  WHERE a.status <> 'DRAFT';

-- =====================================================================
--  DONE. Refresh the Supabase schema cache after running this file.
-- =====================================================================
