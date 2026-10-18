-- =====================================================================
--  MLRS — MySQL schema
--  National Metrology Center of Cambodia (NMC), MISTI
--
--  The same database as the PostgreSQL/Supabase one, for MySQL 8.0.16+.
--  This is the FINAL state of the schema — every supabase_*.sql migration
--  already applied — not a replay of them, because a fresh local database
--  has nothing to migrate from.
--
--  WHAT CHANGED IN TRANSLATION, and why. Read this before trusting the
--  file; four of these are behaviour, not cosmetics.
--
--  1. UUID -> CHAR(36) with DEFAULT (UUID()).
--     MySQL has no uuid type. Values are the same 36-character text, so
--     ids copied from Supabase keep working.
--
--  2. TEXT -> VARCHAR(n) wherever the column is indexed, unique or a key.
--     MySQL cannot index TEXT without a prefix length. Free prose
--     (addresses, descriptions, remarks) stays TEXT.
--
--  3. Partial unique indexes have no MySQL equivalent. PostgreSQL's
--        UNIQUE (licence_no, period_month) WHERE status NOT IN (...)
--     is rebuilt here as a STORED generated column that is NULL when the
--     predicate is false, with a plain unique index on it — MySQL unique
--     indexes ignore NULLs, so the rule applies to exactly the same rows.
--     These three rules are what stops a licensee ending up with two open
--     months and their entries split silently between them, so they are
--     reproduced rather than dropped.
--
--  4. TIMESTAMPTZ -> DATETIME(3) holding UTC. MySQL's TIMESTAMP stops at
--     2038 and silently converts with the session time zone; DATETIME
--     does neither. Every connection must set time_zone = '+00:00' (the
--     adapter does) and every value stored is UTC. Cambodia time is
--     applied where it is meant: in annex8_deadline().
--
--  5. updated_at triggers -> ON UPDATE CURRENT_TIMESTAMP(3), which is the
--     native MySQL way to do exactly what the PL/pgSQL trigger did.
--
--  6. Row Level Security is not translated. It has no MySQL equivalent,
--     and the application does not rely on it: every write already goes
--     through the Express API, and the browser no longer reaches the
--     database at all. Access control lives in server.ts.
--
--  Run:  mysql -u root -p < mysql/01_schema.sql
-- =====================================================================

CREATE DATABASE IF NOT EXISTS mlrs
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE mlrs;

SET time_zone = '+00:00';

-- utf8mb4 throughout is not optional: every Khmer character in this
-- database is 3 bytes, and utf8mb3 would truncate them.


-- =====================================================================
--  1. ACCOUNTS
-- =====================================================================

-- The real sign-in table. PBKDF2 hashes verified by the server; there is
-- no Supabase Auth here, which is the point of the move.
CREATE TABLE IF NOT EXISTS users (
  id                          CHAR(36)     NOT NULL DEFAULT (UUID()),
  username                    VARCHAR(190) NOT NULL,
  email                       VARCHAR(190) NOT NULL,
  role                        VARCHAR(32)  NOT NULL DEFAULT 'company',

  license_number              VARCHAR(190),
  company_name_kh             VARCHAR(255),
  company_name_en             VARCHAR(255),
  address                     TEXT,
  phone                       VARCHAR(64),
  legal_representative        VARCHAR(255),
  representative_position     VARCHAR(255),

  -- Password material. `password` is the legacy plaintext column some rows
  -- still carry; the server strips both before anything reaches a browser.
  password                    VARCHAR(255),
  password_hash               TEXT,
  password_updated_at         DATETIME(3),
  must_change_password        TINYINT(1)   NOT NULL DEFAULT 0,
  last_password_change_by     VARCHAR(190),

  can_view                    TINYINT(1)   NOT NULL DEFAULT 1,
  can_edit                    TINYINT(1)   NOT NULL DEFAULT 1,
  can_save                    TINYINT(1)   NOT NULL DEFAULT 1,
  can_delete                  TINYINT(1)   NOT NULL DEFAULT 1,

  admin_can_add_company_user  TINYINT(1)   NOT NULL DEFAULT 0,
  admin_can_add_admin_user    TINYINT(1)   NOT NULL DEFAULT 0,
  admin_can_edit_users        TINYINT(1)   NOT NULL DEFAULT 0,
  admin_can_deactivate_users  TINYINT(1)   NOT NULL DEFAULT 0,
  admin_can_view_all_users    TINYINT(1)   NOT NULL DEFAULT 0,
  admin_can_view_licenses     TINYINT(1)   NOT NULL DEFAULT 0,
  admin_can_create_licenses   TINYINT(1)   NOT NULL DEFAULT 0,
  admin_can_edit_licenses     TINYINT(1)   NOT NULL DEFAULT 0,
  admin_can_export_licenses   TINYINT(1)   NOT NULL DEFAULT 0,
  admin_can_print_licenses    TINYINT(1)   NOT NULL DEFAULT 0,
  admin_can_renew_licenses    TINYINT(1)   NOT NULL DEFAULT 0,

  is_active                   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at                  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at                  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY uniq_users_username (username),
  UNIQUE KEY uniq_users_email (email),
  KEY idx_users_licence (license_number),
  CONSTRAINT chk_users_role CHECK (role IN ('superadmin', 'admin', 'company'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS companies (
  id               CHAR(36)     NOT NULL DEFAULT (UUID()),
  company_name_kh  VARCHAR(255) NOT NULL,
  company_name_en  VARCHAR(255) NOT NULL,
  license_number   VARCHAR(190) NOT NULL,
  address          TEXT         NOT NULL,
  contact_person   VARCHAR(255) NOT NULL,
  phone            VARCHAR(64)  NOT NULL,
  email            VARCHAR(190) NOT NULL,
  is_active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                     ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uniq_companies_licence (license_number),
  UNIQUE KEY uniq_companies_email (email)
) ENGINE=InnoDB;

-- Kept for the rows that exist. In PostgreSQL this was a foreign key to
-- auth.users; that service does not come with us, so the key is dropped
-- and the table stands alone.
CREATE TABLE IF NOT EXISTS profiles (
  id                          CHAR(36)     NOT NULL DEFAULT (UUID()),
  username                    VARCHAR(190) NOT NULL,
  email                       VARCHAR(190) NOT NULL,
  role                        VARCHAR(32)  NOT NULL,
  company_id                  CHAR(36),
  can_view                    TINYINT(1)   NOT NULL DEFAULT 1,
  can_edit                    TINYINT(1)   NOT NULL DEFAULT 1,
  can_save                    TINYINT(1)   NOT NULL DEFAULT 1,
  can_delete                  TINYINT(1)   NOT NULL DEFAULT 1,
  admin_can_add_company_user  TINYINT(1)   NOT NULL DEFAULT 0,
  admin_can_add_admin_user    TINYINT(1)   NOT NULL DEFAULT 0,
  admin_can_edit_users        TINYINT(1)   NOT NULL DEFAULT 0,
  admin_can_deactivate_users  TINYINT(1)   NOT NULL DEFAULT 0,
  admin_can_view_all_users    TINYINT(1)   NOT NULL DEFAULT 0,
  is_active                   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at                  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at                  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uniq_profiles_username (username),
  UNIQUE KEY uniq_profiles_email (email),
  KEY idx_profiles_company (company_id),
  CONSTRAINT chk_profiles_role CHECK (role IN ('superadmin', 'admin', 'company'))
) ENGINE=InnoDB;


-- =====================================================================
--  2. LEGACY FLAT REPORT  (frozen — still readable, no longer written)
-- =====================================================================

CREATE TABLE IF NOT EXISTS reports (
  id                        CHAR(36)     NOT NULL DEFAULT (UUID()),
  profile_id                CHAR(36),
  company_id                CHAR(36),

  license_number            VARCHAR(190) NOT NULL,
  company_name_kh           VARCHAR(255) NOT NULL,

  customer_name             VARCHAR(255) NOT NULL,
  customer_address          TEXT         NOT NULL,

  measuring_instrument      VARCHAR(255) NOT NULL,
  instrument_serial_number  VARCHAR(190) NOT NULL,
  scope_of_weight_measure   VARCHAR(255) NOT NULL,
  spare_parts               TEXT,
  spare_part_serial_number  VARCHAR(190),

  service_type              VARCHAR(32)  NOT NULL,
  service_start_date        VARCHAR(32)  NOT NULL,
  service_end_date          VARCHAR(32)  NOT NULL,
  report_month              VARCHAR(32)  NOT NULL,
  report_year               VARCHAR(16)  NOT NULL,

  report_status             VARCHAR(32)  NOT NULL DEFAULT 'Submitted',
  rejection_reason          TEXT,
  verification_token_hash   VARCHAR(255),

  -- Tagged by the Annex 8 migration so the two generations can be told
  -- apart in dashboards and exports.
  format_version            VARCHAR(32)  DEFAULT 'LEGACY-1',

  approved_at               DATETIME(3),
  approved_by               VARCHAR(190),
  created_at                DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at                DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                              ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  KEY idx_reports_licence (license_number),
  KEY idx_reports_period (report_year, report_month),
  KEY idx_reports_serial (instrument_serial_number),
  CONSTRAINT chk_reports_service_type
    CHECK (service_type IN ('Manufacture', 'Installation', 'Repair'))
) ENGINE=InnoDB;


-- =====================================================================
--  3. LOGS
-- =====================================================================

CREATE TABLE IF NOT EXISTS login_history (
  id           CHAR(36)     NOT NULL DEFAULT (UUID()),
  profile_id   CHAR(36),
  user_email   VARCHAR(190) NOT NULL,
  user_role    VARCHAR(32)  NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  login_status VARCHAR(32)  NOT NULL,
  ip_address   VARCHAR(64),
  user_agent   TEXT,
  device_info  TEXT,
  login_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_login_history_at (login_at DESC),
  KEY idx_login_history_email (user_email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id               CHAR(36)     NOT NULL DEFAULT (UUID()),
  actor_profile_id CHAR(36),
  actor_email      VARCHAR(190) NOT NULL,
  actor_role       VARCHAR(32)  NOT NULL,
  action_type      VARCHAR(64)  NOT NULL,
  details          TEXT         NOT NULL,
  ip_address       VARCHAR(64),
  target_user_id   VARCHAR(190),
  created_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_logs_at (created_at DESC)
) ENGINE=InnoDB;


-- =====================================================================
--  4. ENTERPRISE LICENCE REGISTRY
-- =====================================================================

CREATE TABLE IF NOT EXISTS enterprise_licenses (
  id                             CHAR(36)     NOT NULL DEFAULT (UUID()),
  company_user_id                VARCHAR(190),
  company_id                     VARCHAR(190),
  company_name                   VARCHAR(255) NOT NULL,
  company_name_kh                VARCHAR(255),
  license_number                 VARCHAR(190) NOT NULL,

  company_address                TEXT,
  province_city                  VARCHAR(190),
  district_khan                  VARCHAR(190),
  commune_sangkat                VARCHAR(190),
  village                        VARCHAR(190),
  business_latitude              DOUBLE,
  business_longitude             DOUBLE,
  business_location_source       VARCHAR(64),
  business_geo_address           TEXT,
  location_updated_at            DATETIME(3),

  phone_number                   VARCHAR(64),
  email                          VARCHAR(190),
  business_type                  VARCHAR(190),
  service_scope                  TEXT,
  measuring_instrument_type      TEXT,

  license_owner_name             VARCHAR(255),
  license_owner_position         VARCHAR(255),
  license_owner_national_id      VARCHAR(190),
  license_owner_phone            VARCHAR(64),
  license_owner_email            VARCHAR(190),
  license_owner_photo_url        TEXT,
  license_owner_photo_path       TEXT,
  license_owner_photo_file_name  VARCHAR(255),
  license_owner_photo_uploaded_at DATETIME(3),

  representative_date_of_birth   VARCHAR(32),
  representative_gender          VARCHAR(32),
  representative_nationality     VARCHAR(64),

  telegram_chat_id               VARCHAR(64),
  telegram_username              VARCHAR(190),
  telegram_first_name            VARCHAR(190),
  telegram_last_name             VARCHAR(190),
  telegram_connected_at          VARCHAR(64),
  telegram_connection_status     VARCHAR(64) DEFAULT 'Not Connected',
  telegram_registration_token_hash       VARCHAR(255),
  telegram_registration_token_expires_at VARCHAR(64),

  license_issue_date             VARCHAR(32)  NOT NULL,
  license_expiry_date            VARCHAR(32)  NOT NULL,
  license_validity_years         INT DEFAULT 3,
  license_status                 VARCHAR(32)  DEFAULT 'Active',

  last_90_day_reminder_sent_at   VARCHAR(64),
  last_60_day_reminder_sent_at   VARCHAR(64),
  last_30_day_reminder_sent_at   VARCHAR(64),
  last_15_day_reminder_sent_at   VARCHAR(64),
  last_7_day_reminder_sent_at    VARCHAR(64),
  expired_reminder_sent_at       VARCHAR(64),

  notes                          TEXT,
  created_by                     VARCHAR(190),
  updated_by                     VARCHAR(190),
  created_at                     VARCHAR(64),
  updated_at                     VARCHAR(64),

  PRIMARY KEY (id),
  UNIQUE KEY uniq_enterprise_licenses_number (license_number),
  KEY idx_enterprise_licenses_status (license_status),
  KEY idx_enterprise_licenses_expiry (license_expiry_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS enterprise_license_attachments (
  id                  CHAR(36)     NOT NULL DEFAULT (UUID()),
  license_id          CHAR(36),
  document_type       VARCHAR(190),
  document_number     VARCHAR(190),
  document_date       DATE,
  document_status     VARCHAR(64) DEFAULT 'Uploaded',
  file_name           VARCHAR(255) NOT NULL,
  file_type           VARCHAR(190),
  file_size           BIGINT,
  file_url            TEXT,
  file_path           TEXT,
  attachment_category VARCHAR(190),
  display_order       INT DEFAULT 0,
  is_required         TINYINT(1) DEFAULT 0,
  is_verified         TINYINT(1) DEFAULT 0,
  verified_at         DATETIME(3),
  verified_by         VARCHAR(190),
  uploaded_by         VARCHAR(190),
  uploaded_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  notes               TEXT,
  PRIMARY KEY (id),
  KEY idx_attachments_licence (license_id),
  CONSTRAINT fk_attachments_licence FOREIGN KEY (license_id)
    REFERENCES enterprise_licenses (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS enterprise_license_location_history (
  id              CHAR(36)    NOT NULL DEFAULT (UUID()),
  license_id      CHAR(36),
  latitude        DOUBLE,
  longitude       DOUBLE,
  location_source VARCHAR(64),
  geo_address     TEXT,
  changed_by      VARCHAR(190),
  changed_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_location_history_licence (license_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS license_reminder_logs (
  id                      CHAR(36)    NOT NULL DEFAULT (UUID()),
  license_id              CHAR(36),
  telegram_bot_setting_id CHAR(36),
  reminder_type           VARCHAR(64),
  reminder_days           INT,
  telegram_chat_id        VARCHAR(64),
  telegram_username       VARCHAR(190),
  message_text            TEXT,
  send_status             VARCHAR(32) DEFAULT 'Sent',
  error_message           TEXT,
  sent_at                 VARCHAR(64),
  created_at              VARCHAR(64),
  PRIMARY KEY (id),
  KEY idx_reminder_logs_licence (license_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS license_renewal_history (
  id              CHAR(36)     NOT NULL DEFAULT (UUID()),
  license_id      CHAR(36),
  old_issue_date  VARCHAR(32)  NOT NULL,
  old_expiry_date VARCHAR(32)  NOT NULL,
  new_issue_date  VARCHAR(32)  NOT NULL,
  new_expiry_date VARCHAR(32)  NOT NULL,
  renewed_by      VARCHAR(190) NOT NULL,
  renewed_by_role VARCHAR(64)  NOT NULL,
  renewed_at      VARCHAR(64),
  notes           TEXT,
  PRIMARY KEY (id),
  KEY idx_renewal_history_licence (license_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS map_settings (
  id              VARCHAR(64)  NOT NULL,
  tile_url        TEXT,
  attribution     TEXT,
  default_zoom    INT DEFAULT 7,
  default_lat     DOUBLE,
  default_lng     DOUBLE,
  updated_by      VARCHAR(190),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB;


-- =====================================================================
--  5. TELEGRAM
-- =====================================================================

CREATE TABLE IF NOT EXISTS telegram_bot_settings (
  id                       VARCHAR(64)  NOT NULL,
  bot_name                 VARCHAR(190),
  bot_username             VARCHAR(190) NOT NULL,
  bot_token_encrypted      TEXT         NOT NULL,
  bot_purpose              VARCHAR(64)  DEFAULT 'report_group',
  default_chat_id          VARCHAR(64),
  default_group_chat_id    VARCHAR(64),
  webhook_url              TEXT,
  last_webhook_setup_at    VARCHAR(64),
  webhook_secret_encrypted TEXT,
  is_active                TINYINT(1)   NOT NULL DEFAULT 0,
  description              TEXT,
  bot_description          TEXT,
  last_test_status         VARCHAR(64),
  last_test_message        TEXT,
  last_tested_at           VARCHAR(64),
  connection_status        VARCHAR(64)  DEFAULT 'not_verified',
  last_error               TEXT,
  webhook_status           VARCHAR(64)  DEFAULT 'not_configured',
  bot_display_name         VARCHAR(190),
  created_by               VARCHAR(190),
  updated_by               VARCHAR(190),
  created_at               VARCHAR(64)  NOT NULL,
  updated_at               VARCHAR(64)  NOT NULL,
  PRIMARY KEY (id),
  KEY idx_telegram_purpose (bot_purpose, is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS monthly_report_digest_logs (
  id                      CHAR(36)    NOT NULL DEFAULT (UUID()),
  period_month            VARCHAR(16) NOT NULL,
  telegram_bot_setting_id VARCHAR(64),
  telegram_chat_id        VARCHAR(64),
  licensee_count          INT         NOT NULL DEFAULT 0,
  submitted_count         INT         NOT NULL DEFAULT 0,
  on_time_count           INT         NOT NULL DEFAULT 0,
  late_count              INT         NOT NULL DEFAULT 0,
  missing_count           INT         NOT NULL DEFAULT 0,
  compliance_rate         INT         NOT NULL DEFAULT 0,
  message_count           INT         NOT NULL DEFAULT 1,
  message_text            LONGTEXT,
  send_status             VARCHAR(32) NOT NULL DEFAULT 'Sent',
  error_message           TEXT,
  sent_at                 DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_digest_logs_period (period_month, send_status),
  KEY idx_digest_logs_sent_at (sent_at DESC),
  CONSTRAINT chk_digest_status CHECK (send_status IN ('Sent', 'Failed', 'Skipped'))
) ENGINE=InnoDB;


-- =====================================================================
--  6. ANNEX 8 — LICENCE REFERENCE DATA
-- =====================================================================

CREATE TABLE IF NOT EXISTS annex8_licence_profiles (
  license_number     VARCHAR(190) NOT NULL,
  licence_type       VARCHAR(32)  NOT NULL DEFAULT 'MANUF_INSTALL',
  registration_no    VARCHAR(190),
  decision_no        VARCHAR(190),
  decision_date      DATE,
  operating_address  TEXT,
  contact_name       VARCHAR(255),
  contact_position   VARCHAR(255),
  contact_phone      VARCHAR(64),
  contact_email      VARCHAR(190),
  -- Part 7 prints the legal representative's own position; without these
  -- the preparer's position would be printed in both signature blocks.
  legal_rep_name     VARCHAR(255),
  legal_rep_position VARCHAR(255),
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                       ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (license_number),
  CONSTRAINT chk_a8_licence_type CHECK (licence_type IN ('MANUF_INSTALL', 'REPAIR'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS annex8_licence_scope (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  license_number VARCHAR(190) NOT NULL,
  category_code  VARCHAR(32)  NOT NULL,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uniq_a8_scope (license_number, category_code),
  KEY idx_a8_scope_licence (license_number),
  CONSTRAINT chk_a8_scope_category CHECK (category_code IN (
    'NAWI','WEIGHBRIDGE','WEIGHTS','FUEL_DISPENSER','LPG_DISPENSER',
    'ELEC_METER','WATER_METER','EV_CHARGER','OTHER'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS annex8_licence_technicians (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  license_number VARCHAR(190) NOT NULL,
  full_name      VARCHAR(255) NOT NULL,
  `position`     VARCHAR(255),
  id_card_no     VARCHAR(190),
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                   ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_a8_technicians_licence (license_number)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS annex8_licence_standards (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  license_number VARCHAR(190) NOT NULL,
  equipment      VARCHAR(255) NOT NULL,
  serial_no      VARCHAR(190),
  class_range    VARCHAR(190),
  cal_cert_no    VARCHAR(190),
  lab            VARCHAR(255),
  cal_date       DATE,
  due_date       DATE,
  status         VARCHAR(32)  NOT NULL DEFAULT 'VALID',
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                   ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_a8_standards_licence (license_number),
  CONSTRAINT chk_a8_licence_std_status
    CHECK (status IN ('VALID', 'EXPIRED', 'OUT_OF_SERVICE'))
) ENGINE=InnoDB;


-- =====================================================================
--  7. ANNEX 8 — THE MONTHLY REPORT
--
--  Note the three generated columns near the bottom. They are the MySQL
--  rendering of PostgreSQL's partial unique indexes, and they are the
--  reason a licensee cannot end up with two open months.
-- =====================================================================

CREATE TABLE IF NOT EXISTS annex8_reports (
  id                     CHAR(36)     NOT NULL DEFAULT (UUID()),

  report_id              VARCHAR(64),            -- NMC-RPT-YYYYMM-#####
  format_version         VARCHAR(32)  NOT NULL DEFAULT 'A8-2026.2',
  template_version       VARCHAR(32)  NOT NULL DEFAULT 'v1',

  licence_no             VARCHAR(190) NOT NULL,
  user_id                VARCHAR(190),
  licence_type           VARCHAR(32)  NOT NULL DEFAULT 'MANUF_INSTALL',
  enterprise_name_kh     VARCHAR(255),
  enterprise_name_en     VARCHAR(255),
  registration_no        VARCHAR(190),
  licence_valid_to       DATE,
  operating_address      TEXT,

  period_month           VARCHAR(16)  NOT NULL,  -- YYYY-MM
  report_type            VARCHAR(32)  NOT NULL DEFAULT 'REGULAR',
  original_report_id     VARCHAR(64),

  contact_name           VARCHAR(255),
  contact_position       VARCHAR(255),
  contact_phone          VARCHAR(64),
  contact_email          VARCHAR(190),

  -- Part 2 is computed by annex8_part2_totals() and frozen here at submit.
  -- Never written from a client payload.
  part2_summary          JSON,
  events                 JSON,
  warnings               JSON,

  declaration_accepted   TINYINT(1)   NOT NULL DEFAULT 0,

  status                 VARCHAR(32)  NOT NULL DEFAULT 'OPEN',
  on_time                TINYINT(1),
  submitted_at           DATETIME(3),
  submitted_by           VARCHAR(190),

  opened_at              DATETIME(3),
  opened_by              VARCHAR(190),
  returned_at            DATETIME(3),
  returned_by            VARCHAR(190),

  received_at            DATETIME(3),
  reviewer               VARCHAR(190),
  nmc_remarks            TEXT,
  is_complete            TINYINT(1),

  verification_token_hash VARCHAR(255),

  official_docx_path     TEXT,
  official_pdf_path      TEXT,
  official_docx_sha256   VARCHAR(64),
  official_pdf_sha256    VARCHAR(64),
  official_rendered_at   DATETIME(3),
  official_render_error  TEXT,

  created_at             DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at             DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                           ON UPDATE CURRENT_TIMESTAMP(3),

  -- --- the three partial-unique rules, as generated columns -----------
  -- Each is NULL when the PostgreSQL WHERE clause would have excluded the
  -- row, and MySQL unique indexes ignore NULLs.

  -- (a) one live (submitted/returned/accepted) report per licence per month
  uniq_live_key CHAR(210) GENERATED ALWAYS AS (
    CASE WHEN report_type <> 'AMENDMENT' AND status NOT IN ('DRAFT', 'OPEN')
         THEN CONCAT(licence_no, '|', period_month) END) STORED,

  -- (b) one open container per licence per month
  uniq_open_key CHAR(210) GENERATED ALWAYS AS (
    CASE WHEN report_type <> 'AMENDMENT' AND status IN ('DRAFT', 'OPEN')
         THEN CONCAT(licence_no, '|', period_month) END) STORED,

  -- (c) one open amendment per licence per month
  uniq_amend_key CHAR(210) GENERATED ALWAYS AS (
    CASE WHEN report_type = 'AMENDMENT' AND status IN ('DRAFT', 'OPEN')
         THEN CONCAT(licence_no, '|', period_month) END) STORED,

  PRIMARY KEY (id),
  UNIQUE KEY uniq_a8_report_no (report_id),
  UNIQUE KEY uniq_a8_report_period (uniq_live_key),
  UNIQUE KEY uniq_a8_report_open (uniq_open_key),
  UNIQUE KEY uniq_a8_amendment_open (uniq_amend_key),
  KEY idx_a8_reports_licence (licence_no),
  KEY idx_a8_reports_period (period_month),
  KEY idx_a8_reports_status (status),
  KEY idx_a8_reports_licence_period (licence_no, period_month, status),
  KEY idx_a8_reports_template_version (template_version),

  CONSTRAINT chk_a8_reports_status
    CHECK (status IN ('OPEN', 'DRAFT', 'SUBMITTED', 'RETURNED', 'ACCEPTED')),
  CONSTRAINT chk_a8_reports_type
    CHECK (report_type IN ('REGULAR', 'NIL', 'AMENDMENT')),
  CONSTRAINT chk_a8_reports_licence_type
    CHECK (licence_type IN ('MANUF_INSTALL', 'REPAIR'))
) ENGINE=InnoDB;


-- =====================================================================
--  8. ANNEX 8 — ENTRY TABLES (Parts 3, 3A, 4, 5)
--
--  deleted_at drives the ten-second undo. Because it is a column and not
--  a client-side timer, an undo still works after a page reload. Every
--  read must filter deleted_at IS NULL.
-- =====================================================================

CREATE TABLE IF NOT EXISTS annex8_report_instruments (
  id                   CHAR(36)     NOT NULL DEFAULT (UUID()),
  report_uuid          CHAR(36)     NOT NULL,
  row_no               INT          NOT NULL DEFAULT 1,

  op_code              VARCHAR(2)   NOT NULL,     -- M = ផលិត, I = ដំឡើង
  category             VARCHAR(32)  NOT NULL,
  category_other       VARCHAR(255),
  instrument_name      VARCHAR(255) NOT NULL,
  model                VARCHAR(190),
  serial_no            VARCHAR(190) NOT NULL,
  manufacturer         VARCHAR(255),
  country              VARCHAR(190),

  -- e is the verification scale interval, NOT the resolution d.
  max_capacity         VARCHAR(64),
  min_capacity         VARCHAR(64),
  e_value              VARCHAR(64),
  unit                 VARCHAR(32),
  accuracy_class       VARCHAR(32),
  type_approval_no     VARCHAR(190),

  completion_date      DATE,
  customer_name        VARCHAR(255),
  province             VARCHAR(190),
  address              TEXT,
  latitude             DECIMAL(10, 7),
  longitude            DECIMAL(10, 7),
  label_qr_no          VARCHAR(190),

  verification_status  VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
  verification_cert_no VARCHAR(190),
  verification_date    DATE,

  created_by           VARCHAR(190),
  updated_by           VARCHAR(190),
  deleted_at           DATETIME(3),
  deleted_by           VARCHAR(190),
  created_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                         ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  KEY idx_a8_instr_report (report_uuid, row_no),
  KEY idx_a8_instr_serial (serial_no),
  KEY idx_a8_instr_label (label_qr_no),
  KEY idx_a8_instr_pending (verification_status),
  CONSTRAINT fk_a8_instr_report FOREIGN KEY (report_uuid)
    REFERENCES annex8_reports (id) ON DELETE CASCADE,
  CONSTRAINT chk_a8_instr_op CHECK (op_code IN ('M', 'I')),
  CONSTRAINT chk_a8_instr_verif
    CHECK (verification_status IN ('PASSED', 'FAILED', 'PENDING'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS annex8_report_modules (
  id                 CHAR(36)     NOT NULL DEFAULT (UUID()),
  report_uuid        CHAR(36)     NOT NULL,
  row_no             INT          NOT NULL DEFAULT 1,

  host_serial_no     VARCHAR(190) NOT NULL,
  host_part          VARCHAR(4),
  module_name        VARCHAR(255) NOT NULL,
  model              VARCHAR(190),
  serial_no          VARCHAR(190),
  range_e            VARCHAR(190),
  manufacturer       VARCHAR(255),
  country            VARCHAR(190),
  cert_no            VARCHAR(190),
  new_or_replacement VARCHAR(16)  NOT NULL DEFAULT 'NEW',

  created_by         VARCHAR(190),
  updated_by         VARCHAR(190),
  deleted_at         DATETIME(3),
  deleted_by         VARCHAR(190),
  created_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                       ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  KEY idx_a8_mod_report (report_uuid, row_no),
  KEY idx_a8_mod_host (host_serial_no),
  CONSTRAINT fk_a8_mod_report FOREIGN KEY (report_uuid)
    REFERENCES annex8_reports (id) ON DELETE CASCADE,
  CONSTRAINT chk_a8_mod_host_part CHECK (host_part IN ('P3', 'P4')),
  CONSTRAINT chk_a8_mod_kind CHECK (new_or_replacement IN ('NEW', 'REPLACEMENT'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS annex8_report_repairs (
  id                   CHAR(36)     NOT NULL DEFAULT (UUID()),
  report_uuid          CHAR(36)     NOT NULL,
  row_no               INT          NOT NULL DEFAULT 1,

  category             VARCHAR(32)  NOT NULL,
  instrument_name      VARCHAR(255) NOT NULL,
  model                VARCHAR(190),
  serial_no            VARCHAR(190) NOT NULL,
  customer_name        VARCHAR(255),
  province             VARCHAR(190),
  address              TEXT,
  latitude             DECIMAL(10, 7),
  longitude            DECIMAL(10, 7),

  repair_from          DATE,
  repair_to            DATE,
  repair_description   TEXT,

  -- Art. 25: removing a seal requires an Annex 10 notification (V03).
  seal_broken          TINYINT(1)   NOT NULL DEFAULT 0,
  seal_removed_no      VARCHAR(190),
  notification_no      VARCHAR(190),

  technician           VARCHAR(255),

  verification_status  VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
  verification_cert_no VARCHAR(190),
  verification_date    DATE,

  created_by           VARCHAR(190),
  updated_by           VARCHAR(190),
  deleted_at           DATETIME(3),
  deleted_by           VARCHAR(190),
  created_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                         ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  KEY idx_a8_rep_report (report_uuid, row_no),
  KEY idx_a8_rep_serial (serial_no),
  KEY idx_a8_rep_pending (verification_status),
  CONSTRAINT fk_a8_rep_report FOREIGN KEY (report_uuid)
    REFERENCES annex8_reports (id) ON DELETE CASCADE,
  CONSTRAINT chk_a8_rep_verif
    CHECK (verification_status IN ('PASSED', 'FAILED', 'PENDING'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS annex8_report_standards (
  id          CHAR(36)     NOT NULL DEFAULT (UUID()),
  report_uuid CHAR(36)     NOT NULL,
  row_no      INT          NOT NULL DEFAULT 1,

  equipment   VARCHAR(255) NOT NULL,
  serial_no   VARCHAR(190),
  class_range VARCHAR(190),
  cal_cert_no VARCHAR(190),
  lab         VARCHAR(255),
  cal_date    DATE,
  due_date    DATE,
  status      VARCHAR(32)  NOT NULL DEFAULT 'VALID',

  created_by  VARCHAR(190),
  updated_by  VARCHAR(190),
  deleted_at  DATETIME(3),
  deleted_by  VARCHAR(190),
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  KEY idx_a8_std_report (report_uuid, row_no),
  CONSTRAINT fk_a8_std_report FOREIGN KEY (report_uuid)
    REFERENCES annex8_reports (id) ON DELETE CASCADE,
  CONSTRAINT chk_a8_std_status
    CHECK (status IN ('VALID', 'EXPIRED', 'OUT_OF_SERVICE'))
) ENGINE=InnoDB;


-- =====================================================================
--  9. ANNEX 8 — CARRY-OVER, DRAFTS, NUMBERING, AUDIT
-- =====================================================================

CREATE TABLE IF NOT EXISTS annex8_carry_over_updates (
  id                CHAR(36)     NOT NULL DEFAULT (UUID()),
  report_uuid       CHAR(36)     NOT NULL,
  source_part       VARCHAR(4)   NOT NULL,
  source_row_id     CHAR(36),
  source_report_id  VARCHAR(64),
  serial_no         VARCHAR(190),
  new_status        VARCHAR(16)  NOT NULL,
  cert_no           VARCHAR(190),
  verification_date DATE,
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_a8_carry_report (report_uuid),
  CONSTRAINT fk_a8_carry_report FOREIGN KEY (report_uuid)
    REFERENCES annex8_reports (id) ON DELETE CASCADE,
  CONSTRAINT chk_a8_carry_part CHECK (source_part IN ('P3', 'P4')),
  CONSTRAINT chk_a8_carry_status CHECK (new_status IN ('PASSED', 'FAILED', 'PENDING'))
) ENGINE=InnoDB;

-- Holds the single entry form a user has open, so a dropped connection
-- does not lose what they were typing. draft_kind = 'MONTH' rows are the
-- read-only legacy whole-month payloads from before incremental entry.
CREATE TABLE IF NOT EXISTS annex8_report_drafts (
  licence_no   VARCHAR(190) NOT NULL,
  period_month VARCHAR(16)  NOT NULL,
  payload      JSON         NOT NULL,
  draft_kind   VARCHAR(16)  NOT NULL DEFAULT 'MONTH',
  entry_part   VARCHAR(32),
  entry_id     VARCHAR(64),
  updated_by   VARCHAR(190),
  updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                 ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (licence_no, period_month)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS annex8_report_counters (
  period_month VARCHAR(16) NOT NULL,
  `last_value`   INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (period_month)
) ENGINE=InnoDB;

-- Append-only. Nothing in the application updates or deletes a row here,
-- and there is deliberately no foreign key to annex8_reports: if a report
-- were ever removed, the record of who did what to it is exactly the thing
-- that must survive.
CREATE TABLE IF NOT EXISTS annex8_report_audit_log (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  report_uuid  CHAR(36),
  licence_no   VARCHAR(190),
  period_month VARCHAR(16),
  entity       VARCHAR(32)  NOT NULL,
  entity_id    VARCHAR(64),
  action       VARCHAR(32)  NOT NULL,
  actor        VARCHAR(190),
  actor_role   VARCHAR(32),
  old_value    JSON,
  new_value    JSON,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_a8_audit_report (report_uuid, created_at DESC),
  KEY idx_a8_audit_licence (licence_no, period_month, created_at DESC),
  KEY idx_a8_audit_actor (actor, created_at DESC),
  CONSTRAINT chk_a8_audit_entity CHECK (entity IN (
    'report', 'instrument', 'module', 'repair', 'standard', 'carry_over', 'events')),
  CONSTRAINT chk_a8_audit_action CHECK (action IN (
    'create', 'update', 'delete', 'undelete',
    'submit', 'return', 'accept', 'amend', 'open'))
) ENGINE=InnoDB;
