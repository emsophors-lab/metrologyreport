-- =====================================================================
--  MLRS — demo data for the local MySQL database
--
--  Enough to sign in and fill in an Annex 8: one NMC staff account, one
--  licensed enterprise with its licence, licence scope, technicians and
--  standards. Nothing here is real: the enterprise, the people and the
--  licence number are invented for development.
--
--  Passwords are PBKDF2-SHA256 hashes in the format verifyUserPasswordServer()
--  expects. The plaintexts are development-only and are written here so the
--  machine that runs this file is the only place they exist:
--
--      nmcadmin / NmcAdmin#2026     (superadmin)
--      bokor    / Bokor#2026        (company — sees only its own data)
--
--  Change both before this database is reachable by anyone else.
--
--    mysql -u root mlrs < mysql/03_seed.sql
-- =====================================================================

USE mlrs;
SET time_zone = '+00:00';

-- ---------------------------------------------------------------------
--  Accounts
-- ---------------------------------------------------------------------
INSERT INTO users (
  id, username, email, role, license_number,
  company_name_kh, company_name_en, address, phone,
  legal_representative, representative_position,
  password_hash, can_view, can_edit, can_save, can_delete,
  admin_can_view_all_users, admin_can_view_licenses, is_active
) VALUES
(
  'a0000000-0000-4000-8000-000000000001',
  'nmcadmin', 'nmcadmin@nmc.local', 'superadmin', NULL,
  'មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ', 'National Metrology Center',
  'រាជធានីភ្នំពេញ', '023000000',
  'អ្នកគ្រប់គ្រងប្រព័ន្ធ', 'ប្រធានផ្នែកព័ត៌មានវិទ្យា',
  'pbkdf2_sha256$120000$R6qLL/afncnTvdD+V9QSQg==$Q7j6rKQcdhKALcyWDhKBDLk4VIouOtpLiiAQ8NrTQzs=',
  1, 1, 1, 1, 1, 1, 1
),
(
  'a0000000-0000-4000-8000-000000000002',
  'bokor', 'bokor@example.local', 'company', 'LIC-2026-001',
  'ក្រុមហ៊ុន មាត្រាសាស្ត្រ បូកគោ', 'Bokor Metrology Co., Ltd.',
  'ផ្ទះលេខ ១២ ផ្លូវ ២៧១ សង្កាត់ទួលទំពូង ខណ្ឌចំការមន រាជធានីភ្នំពេញ', '012345678',
  'លោក លី ម៉េង', 'នាយកគ្រប់គ្រង',
  'pbkdf2_sha256$120000$uZdZ6SYywxWfIs2B9SxszQ==$mH+Pv3Kn2yv6uT0AVChkZdr8vt5BxqdEp4U6HHPSqCs=',
  1, 1, 1, 1, 0, 0, 1
)
ON DUPLICATE KEY UPDATE username = VALUES(username);

-- ---------------------------------------------------------------------
--  The licence
-- ---------------------------------------------------------------------
INSERT INTO enterprise_licenses (
  id, company_user_id, company_name, company_name_kh, license_number,
  company_address, province_city, phone_number, email,
  business_type, service_scope, measuring_instrument_type,
  license_owner_name, license_owner_position,
  license_issue_date, license_expiry_date, license_validity_years, license_status,
  created_at, updated_at
) VALUES (
  'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'Bokor Metrology Co., Ltd.', 'ក្រុមហ៊ុន មាត្រាសាស្ត្រ បូកគោ', 'LIC-2026-001',
  'ផ្ទះលេខ ១២ ផ្លូវ ២៧១ សង្កាត់ទួលទំពូង ខណ្ឌចំការមន រាជធានីភ្នំពេញ',
  'រាជធានីភ្នំពេញ', '012345678', 'bokor@example.local',
  'ផលិត ដំឡើង និងជួសជុល', 'ផលិត ដំឡើង ជួសជុល ឧបករណ៍វាស់វែង',
  'ជញ្ជីង និងឧបករណ៍ចែកចាយប្រេង',
  'លោក លី ម៉េង', 'នាយកគ្រប់គ្រង',
  '2026-01-15', '2029-01-14', 3, 'Active',
  '2026-01-15T00:00:00Z', '2026-01-15T00:00:00Z'
)
ON DUPLICATE KEY UPDATE company_name = VALUES(company_name);

-- ---------------------------------------------------------------------
--  Annex 8 reference data: who may report on what (drives V06), who the
--  registered technicians are (Part 4) and which standards they hold
--  (Part 5).
-- ---------------------------------------------------------------------
INSERT INTO annex8_licence_profiles (
  license_number, licence_type, registration_no, decision_no, decision_date,
  operating_address, contact_name, contact_position, contact_phone, contact_email,
  legal_rep_name, legal_rep_position
) VALUES (
  'LIC-2026-001', 'MANUF_INSTALL', 'REG-2026-0012', 'សេចក្ដីសម្រេចលេខ ០៤៥ មបវ', '2026-01-15',
  'ផ្ទះលេខ ១២ ផ្លូវ ២៧១ សង្កាត់ទួលទំពូង ខណ្ឌចំការមន រាជធានីភ្នំពេញ',
  'លោក សុខ វិសាល', 'ប្រធានផ្នែកបច្ចេកទេស', '012987654', 'tech@example.local',
  'លោក លី ម៉េង', 'នាយកគ្រប់គ្រង'
)
ON DUPLICATE KEY UPDATE licence_type = VALUES(licence_type);

INSERT INTO annex8_licence_scope (license_number, category_code) VALUES
  ('LIC-2026-001', 'NAWI'),
  ('LIC-2026-001', 'WEIGHBRIDGE'),
  ('LIC-2026-001', 'WEIGHTS'),
  ('LIC-2026-001', 'FUEL_DISPENSER')
ON DUPLICATE KEY UPDATE category_code = VALUES(category_code);

INSERT INTO annex8_licence_technicians (id, license_number, full_name, `position`, id_card_no) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'LIC-2026-001', 'លោក សុខ វិសាល', 'ជាងបច្ចេកទេសជាន់ខ្ពស់', '010203040'),
  ('c0000000-0000-4000-8000-000000000002', 'LIC-2026-001', 'លោក ចាន់ ដារា', 'ជាងបច្ចេកទេស', '010203041')
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

INSERT INTO annex8_licence_standards
  (id, license_number, equipment, serial_no, class_range, cal_cert_no, lab, cal_date, due_date, status) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'LIC-2026-001',
   'កូនថ្លឹងស្តង់ដារ F1', 'STD-F1-0021', 'F1 / 1 mg – 20 kg', 'CAL-2026-0188',
   'មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ', '2026-02-10', '2027-02-09', 'VALID'),
  ('d0000000-0000-4000-8000-000000000002', 'LIC-2026-001',
   'ធុងវាស់ស្តង់ដារ ២០ លីត្រ', 'STD-PM-0007', '20 L / ±0.1 %', 'CAL-2026-0201',
   'មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ', '2026-03-02', '2027-03-01', 'VALID')
ON DUPLICATE KEY UPDATE equipment = VALUES(equipment);

SELECT 'seeded' AS status,
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM enterprise_licenses) AS licences,
       (SELECT COUNT(*) FROM annex8_licence_scope) AS scope_rows,
       (SELECT COUNT(*) FROM annex8_licence_technicians) AS technicians,
       (SELECT COUNT(*) FROM annex8_licence_standards) AS standards;
