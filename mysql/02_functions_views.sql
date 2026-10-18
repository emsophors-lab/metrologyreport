-- =====================================================================
--  MLRS — MySQL functions and views
--
--  The four PL/pgSQL functions the application calls through .rpc(), plus
--  the dashboard union view, rewritten for MySQL 8.
--
--  Run after 01_schema.sql:
--    mysql -u root -p mlrs < mysql/02_functions_views.sql
-- =====================================================================

USE mlrs;
SET time_zone = '+00:00';

DROP VIEW     IF EXISTS annex8_activity_union;
DROP VIEW     IF EXISTS annex8_part2_rows;
DROP FUNCTION IF EXISTS annex8_part2_totals;
DROP PROCEDURE IF EXISTS annex8_next_report_id;
DROP FUNCTION IF EXISTS annex8_deadline;
DROP FUNCTION IF EXISTS annex8_is_on_time;
DROP FUNCTION IF EXISTS annex8_is_on_time_at;


-- ---------------------------------------------------------------------
--  1. Report numbering — NMC-RPT-YYYYMM-#####
--
--  Allocated atomically so two concurrent submissions cannot collide.
--  PostgreSQL did this with INSERT ... ON CONFLICT ... RETURNING. MySQL
--  has no RETURNING, and reading the counter back in a second statement
--  would be a race: another session can increment in between. The
--  LAST_INSERT_ID(expr) form below carries the new value out of the
--  UPDATE itself, per connection, which is the one safe way to do it.
-- ---------------------------------------------------------------------
DELIMITER //

--  It is a PROCEDURE, not a function, on purpose: MySQL refuses to create
--  a non-deterministic function that writes, unless the server-wide
--  log_bin_trust_function_creators is turned on. Asking MISTI to loosen a
--  replication safety setting for one counter is the wrong trade, and a
--  procedure has no such restriction. It returns the number as a one-row
--  result set.
CREATE PROCEDURE annex8_next_report_id(IN p_period VARCHAR(16))
MODIFIES SQL DATA
BEGIN
  DECLARE v_next INT;

  INSERT INTO annex8_report_counters (period_month, `last_value`)
  VALUES (p_period, 1)
  ON DUPLICATE KEY UPDATE `last_value` = LAST_INSERT_ID(`last_value` + 1);

  -- ROW_COUNT() is 1 for a fresh insert, 2 when the duplicate branch ran.
  IF ROW_COUNT() = 1 THEN
    SET v_next = 1;
  ELSE
    SET v_next = LAST_INSERT_ID();
  END IF;

  SELECT CONCAT('NMC-RPT-', REPLACE(p_period, '-', ''), '-', LPAD(v_next, 5, '0'))
         AS annex8_next_report_id;
END //


-- ---------------------------------------------------------------------
--  2. Article 21 — due by the 7th of the following month, 23:59:59
--     Asia/Phnom_Penh.
--
--  Computed here, in the database, so a device with a wrong clock or a
--  server running in UTC cannot change whether a report counts as on
--  time. The offset is written as '+07:00' rather than the zone name
--  because the named zone needs MySQL's time-zone tables loaded, which a
--  fresh install does not have. Cambodia has never observed DST, so the
--  fixed offset is exact, not an approximation.
--
--  Returns UTC, matching every DATETIME(3) in this database.
-- ---------------------------------------------------------------------
CREATE FUNCTION annex8_deadline(p_period VARCHAR(16))
RETURNS DATETIME(3)
DETERMINISTIC
BEGIN
  DECLARE v_local DATETIME(3);

  SET v_local = DATE_SUB(
    DATE_ADD(DATE_ADD(STR_TO_DATE(CONCAT(p_period, '-01'), '%Y-%m-%d'),
                      INTERVAL 1 MONTH),
             INTERVAL 7 DAY),
    INTERVAL 1 SECOND);

  RETURN CONVERT_TZ(v_local, '+07:00', '+00:00');
END //


CREATE FUNCTION annex8_is_on_time_at(p_period VARCHAR(16), p_at DATETIME(3))
RETURNS TINYINT(1)
DETERMINISTIC
BEGIN
  RETURN p_at <= annex8_deadline(p_period);
END //


-- MySQL has no default parameter values, so the one-argument form the
-- application actually calls is its own function.
CREATE FUNCTION annex8_is_on_time(p_period VARCHAR(16))
RETURNS TINYINT(1)
READS SQL DATA
BEGIN
  RETURN UTC_TIMESTAMP(3) <= annex8_deadline(p_period);
END //

DELIMITER ;


-- ---------------------------------------------------------------------
--  3. Part 2 totals, computed in the database
--
--  Part 2 is never typed and never taken from a client. This is the one
--  definition of the totals, used for the live summary while a month is
--  open and frozen into part2_summary at submit.
--
--  The row equation the annex requires:
--      manufactured + installed + repaired = passed + failed + pending
--
--  The shape matches `rows` and `total` of Annex8Summary in
--  src/annex8/types.ts, so the same JSON drives the on-screen summary and
--  the snapshot.
--
--  PostgreSQL used one CTE read twice. A MySQL CTE cannot outlive its
--  statement, so the same rows are exposed as a view instead.
-- ---------------------------------------------------------------------
CREATE VIEW annex8_part2_rows AS
  SELECT
    i.report_uuid,
    i.category,
    CASE WHEN i.op_code = 'M' THEN 1 ELSE 0 END AS m,
    CASE WHEN i.op_code = 'I' THEN 1 ELSE 0 END AS i_,
    0                                           AS r,
    i.verification_status
  FROM annex8_report_instruments i
  WHERE i.deleted_at IS NULL

  UNION ALL

  SELECT p.report_uuid, p.category, 0, 0, 1, p.verification_status
  FROM annex8_report_repairs p
  WHERE p.deleted_at IS NULL;

DELIMITER //

CREATE FUNCTION annex8_part2_totals(p_report_uuid CHAR(36))
RETURNS JSON
READS SQL DATA
BEGIN
  DECLARE v_rows  JSON;
  DECLARE v_total JSON;

  SELECT JSON_OBJECT(
    'manufactured', CAST(COALESCE(SUM(m),  0) AS UNSIGNED),
    'installed',    CAST(COALESCE(SUM(i_), 0) AS UNSIGNED),
    'repaired',     CAST(COALESCE(SUM(r),  0) AS UNSIGNED),
    'passed',       CAST(COALESCE(SUM(verification_status = 'PASSED'),  0) AS UNSIGNED),
    'failed',       CAST(COALESCE(SUM(verification_status = 'FAILED'),  0) AS UNSIGNED),
    'pending',      CAST(COALESCE(SUM(verification_status = 'PENDING'), 0) AS UNSIGNED)
  )
  INTO v_total
  FROM annex8_part2_rows
  WHERE report_uuid = p_report_uuid;

  SELECT COALESCE(JSON_OBJECTAGG(category, counts), JSON_OBJECT())
  INTO v_rows
  FROM (
    SELECT category, JSON_OBJECT(
      'manufactured', CAST(SUM(m)  AS UNSIGNED),
      'installed',    CAST(SUM(i_) AS UNSIGNED),
      'repaired',     CAST(SUM(r)  AS UNSIGNED),
      'passed',       CAST(SUM(verification_status = 'PASSED')  AS UNSIGNED),
      'failed',       CAST(SUM(verification_status = 'FAILED')  AS UNSIGNED),
      'pending',      CAST(SUM(verification_status = 'PENDING') AS UNSIGNED)
    ) AS counts
    FROM annex8_part2_rows
    WHERE report_uuid = p_report_uuid AND category IS NOT NULL
    GROUP BY category
  ) per_category;

  RETURN JSON_OBJECT('rows', v_rows, 'total', v_total);
END //

DELIMITER ;


-- ---------------------------------------------------------------------
--  4. Dashboard union view
--
--  One row per service event across both generations, so counts by
--  category, by province and by month keep working while Annex 8 reports
--  accumulate. Soft-deleted entries and months still being filled in
--  (OPEN) are excluded: neither has been reported to NMC.
--
--  SPLIT_PART has no MySQL equivalent; SUBSTRING_INDEX does the same job
--  on a fixed 'YYYY-MM' string.
-- ---------------------------------------------------------------------
CREATE VIEW annex8_activity_union AS
  SELECT
    'LEGACY-1'                     AS format_version,
    CAST(r.id AS CHAR)             AS row_id,
    r.license_number               AS licence_no,
    r.company_name_kh              AS company_name_kh,
    CAST(NULL AS CHAR) COLLATE utf8mb4_0900_ai_ci             AS category,
    r.measuring_instrument         AS instrument_name,
    r.instrument_serial_number     AS serial_no,
    r.customer_name                AS customer_name,
    CAST(NULL AS CHAR) COLLATE utf8mb4_0900_ai_ci             AS province,
    CASE r.service_type
      WHEN 'Manufacture'  THEN 'M'
      WHEN 'Installation' THEN 'I'
      ELSE 'R'
    END                            AS op_code,
    CAST(r.service_end_date AS CHAR) AS activity_date,
    CAST(NULL AS CHAR) COLLATE utf8mb4_0900_ai_ci             AS verification_status,
    r.report_month                 AS report_month,
    r.report_year                  AS report_year
  FROM reports r

  UNION ALL

  SELECT
    a.format_version,
    CAST(i.id AS CHAR),
    a.licence_no,
    a.enterprise_name_kh,
    i.category,
    i.instrument_name,
    i.serial_no,
    i.customer_name,
    i.province,
    i.op_code,
    CAST(i.completion_date AS CHAR),
    i.verification_status,
    SUBSTRING_INDEX(a.period_month, '-', -1),
    SUBSTRING_INDEX(a.period_month, '-',  1)
  FROM annex8_report_instruments i
  JOIN annex8_reports a ON a.id = i.report_uuid
  WHERE a.status NOT IN ('DRAFT', 'OPEN')
    AND i.deleted_at IS NULL

  UNION ALL

  SELECT
    a.format_version,
    CAST(p.id AS CHAR),
    a.licence_no,
    a.enterprise_name_kh,
    p.category,
    p.instrument_name,
    p.serial_no,
    p.customer_name,
    p.province,
    'R',
    CAST(p.repair_to AS CHAR),
    p.verification_status,
    SUBSTRING_INDEX(a.period_month, '-', -1),
    SUBSTRING_INDEX(a.period_month, '-',  1)
  FROM annex8_report_repairs p
  JOIN annex8_reports a ON a.id = p.report_uuid
  WHERE a.status NOT IN ('DRAFT', 'OPEN')
    AND p.deleted_at IS NULL;
