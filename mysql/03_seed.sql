-- =====================================================================
--  MLRS — demo data for the local MySQL database
--
--  Enough to sign in and fill in an Annex 8: one NMC staff account, one
--  licensed enterprise with its licence, licence scope, technicians and
--  standards. Nothing here is real: the enterprise, the people and the
--  licence number are invented for development.
--
--  The ids, usernames and roles deliberately match INITIAL_USERS in
--  src/demoData.ts. The local development login resolves an account from that
--  list and then sends its id and username to the API as headers; if the
--  database held different ids, every request after signing in would be
--  rejected as an unknown user. Matching them means the same credentials work
--  whether the data is coming from demo data or from this database.
--
--  Passwords are PBKDF2-SHA256 hashes in the format verifyUserPasswordServer()
--  expects, over the same development plaintexts:
--
--      superadmin / admin123
--      admin      / admin123
--      company01  / LIC001      (company — sees only its own data)
--      company02  / LIC001      (a second company, so "all licensees" means
--                                more than one and the scoping is visible)
--
--  Change all three before this database is reachable by anyone else.
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
  'user-sa-001',
  'superadmin', 'info@nmc.gov.kh', 'superadmin', 'NMC-SA-2026',
  'មជ្ឈមណ្ឌលមាត្រាសាស្ត្រជាតិ (NMC)', 'National Metrology Center of Cambodia',
  'មហាវិថីសហព័ន្ធរុស្ស៊ី ភ្នំពេញ កម្ពុជា', '023 884 123',
  'ឯកឧត្តម ប្រធានមជ្ឈមណ្ឌល', 'អគ្គនាយក',
  'pbkdf2_sha256$120000$4fM6Kk4S7W5KdaIiVu8qVw==$dAJXyyZ+0ddz7be0WB2LwAwA9qYjYA6oBRQmHJXvHDg=',
  1, 1, 1, 1, 1, 1, 1
),
(
  'user-ad-001',
  'admin', 'inspection@nmc.gov.kh', 'admin', 'NMC-AD-2026',
  'នាយកដ្ឋានមាត្រាសាស្ត្រឧស្សាហកម្ម', 'Department of Industrial Metrology',
  'មហាវិថីសហព័ន្ធរុស្ស៊ី ភ្នំពេញ កម្ពុជា', '012 345 678',
  'លោក ប្រធាននាយកដ្ឋាន', 'ប្រធាននាយកដ្ឋាន',
  'pbkdf2_sha256$120000$yU8blvY/O+qplmGqIeYiGg==$02dnxbCORVyDYXzoiWMHfP29D/gx20IBCcVQ5oMAc6U=',
  1, 1, 1, 1, 1, 1, 1
),
(
  'user-co-002',
  'company02', 'contact@angkormetro.local', 'company', 'LIC-2026-002',
  'ក្រុមហ៊ុន មាត្រាសាស្ត្រ អង្គរ', 'Angkor Metrology Co',
  'ភូមិស្លក្រាម ឃុំស្លក្រាម ក្រុងសៀមរាប ខេត្តសៀមរាប', '017 222 333',
  'លោកស្រី ចាន់ សុភា', 'នាយិកា',
  'pbkdf2_sha256$120000$87y3oPqTrEAPUFFARJCxYg==$jdgnOsQ4LMc4Ru5Ded/63miBNw7mdUY4Xlr6hQVAPzQ=',
  1, 1, 1, 1, 0, 0, 1
),
(
  'user-co-001',
  'company01', 'contact@bokormetrology.com', 'company', 'LIC-2026-001',
  'ក្រុមហ៊ុន មាត្រាសាស្ត្រ បូកគោ', 'Bokor Metrology Corp',
  'ផ្ទះលេខ ១២A ផ្លូវជាតិលេខ ៣ ខេត្តកំពត', '016 999 888',
  'លោក លី ម៉េង', 'នាយកប្រតិបត្តិ',
  'pbkdf2_sha256$120000$87y3oPqTrEAPUFFARJCxYg==$jdgnOsQ4LMc4Ru5Ded/63miBNw7mdUY4Xlr6hQVAPzQ=',
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
  'user-co-001',
  'Bokor Metrology Corp', 'ក្រុមហ៊ុន មាត្រាសាស្ត្រ បូកគោ', 'LIC-2026-001',
  'ផ្ទះលេខ ១២ ផ្លូវ ២៧១ សង្កាត់ទួលទំពូង ខណ្ឌចំការមន រាជធានីភ្នំពេញ',
  'រាជធានីភ្នំពេញ', '012345678', 'bokor@example.local',
  'ផលិត ដំឡើង និងជួសជុល', 'ផលិត ដំឡើង ជួសជុល ឧបករណ៍វាស់វែង',
  'ជញ្ជីង និងឧបករណ៍ចែកចាយប្រេង',
  'លោក លី ម៉េង', 'នាយកគ្រប់គ្រង',
  '2026-01-15', '2029-01-14', 3, 'Active',
  '2026-01-15T00:00:00Z', '2026-01-15T00:00:00Z'
)
ON DUPLICATE KEY UPDATE company_name = VALUES(company_name);

-- A second licensee. Without one, "admin sees every company" and "a company
-- sees only its own" look identical on screen, and a scoping mistake would
-- not show up until there were real enterprises in the database.
INSERT INTO enterprise_licenses (
  id, company_user_id, company_name, company_name_kh, license_number,
  company_address, province_city, phone_number, email,
  business_type, service_scope, measuring_instrument_type,
  license_owner_name, license_owner_position,
  license_issue_date, license_expiry_date, license_validity_years, license_status,
  created_at, updated_at
) VALUES (
  'b0000000-0000-4000-8000-000000000002',
  'user-co-002',
  'Angkor Metrology Co', 'ក្រុមហ៊ុន មាត្រាសាស្ត្រ អង្គរ', 'LIC-2026-002',
  'ភូមិស្លក្រាម ឃុំស្លក្រាម ក្រុងសៀមរាប ខេត្តសៀមរាប',
  'ខេត្តសៀមរាប', '017 222 333', 'contact@angkormetro.local',
  'ផលិត និងដំឡើង', 'ផលិត ដំឡើង ឧបករណ៍វាស់វែង', 'ជញ្ជីង',
  'លោកស្រី ចាន់ សុភា', 'នាយិកា',
  '2026-02-01', '2029-01-31', 3, 'Active',
  '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z'
)
ON DUPLICATE KEY UPDATE company_name = VALUES(company_name);

INSERT INTO annex8_licence_profiles (license_number, licence_type, contact_name, contact_position)
VALUES ('LIC-2026-002', 'MANUF_INSTALL', 'លោកស្រី ចាន់ សុភា', 'នាយិកា')
ON DUPLICATE KEY UPDATE licence_type = VALUES(licence_type);

INSERT INTO annex8_licence_scope (license_number, category_code) VALUES
  ('LIC-2026-002', 'NAWI'),
  ('LIC-2026-002', 'WEIGHTS')
ON DUPLICATE KEY UPDATE category_code = VALUES(category_code);

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
