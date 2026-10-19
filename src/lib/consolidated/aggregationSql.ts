/** One database statement/snapshot. Only aggregates and full detail tables leave SQL. */
export function consolidatedAggregationSql(dialect: 'postgresql' | 'mysql', inputs?: [string, string, string]) {
  const pg = dialect === 'postgresql';
  const [start, end, cutoff] = inputs ?? (pg ? ['$1', '$2', '$3'] : ['?', '?', '?']);
  const date = (v: string) => `CAST(${v} AS DATE)`;
  const add = (v: string, n: string, unit: string) => pg ? `(${v} + (${n}) * INTERVAL '1 ${unit}')` : `DATE_ADD(${v}, INTERVAL (${n}) ${unit})`;
  const month = (v: string) => pg ? `to_char(${v}, 'YYYY-MM')` : `DATE_FORMAT(${v}, '%Y-%m')`;
  const json = (pairs: string) => `${pg ? 'jsonb_build_object' : 'JSON_OBJECT'}(${pairs})`;
  const array = (table: string, expression: string) => `(SELECT COALESCE(${pg ? 'jsonb_agg' : 'JSON_ARRAYAGG'}(${expression}), ${pg ? "'[]'::jsonb" : 'JSON_ARRAY()'}) FROM ${table})`;
  const joinText = (v: string) => pg ? `string_agg(${v}, ', ' ORDER BY period_month)` : `GROUP_CONCAT(${v} ORDER BY period_month SEPARATOR ', ')`;
  const count = (condition: string) => `SUM(CASE WHEN ${condition} THEN 1 ELSE 0 END)`;
  const firstOfMonth = (v: string) => pg ? `date_trunc('month', ${v})::date` : `CAST(DATE_FORMAT(${v}, '%Y-%m-01') AS DATE)`;
  const yearStart = (v: string) => pg ? `date_trunc('year', ${v})::date` : `CAST(DATE_FORMAT(${v}, '%Y-01-01') AS DATE)`;
  const months = pg ? `((EXTRACT(YEAR FROM e)-EXTRACT(YEAR FROM s))*12 + EXTRACT(MONTH FROM e)-EXTRACT(MONTH FROM s)+1)` : `(TIMESTAMPDIFF(MONTH,s,e)+1)`;
  const sums = ['m', 'i', 'r'].map(op => `${count(`op='${op.toUpperCase()}'`)} AS ${op}`).join(', ');
  const totalsJson = (alias = '') => `'m', ${alias}m, 'i', ${alias}i, 'r', ${alias}r`;
  const params = `SELECT ${date(start)} AS s, ${date(end)} AS e, CAST(${cutoff} AS ${pg ? 'timestamptz' : 'DATETIME(3)'}) AS cutoff`;
  return `WITH RECURSIVE
cfg0 AS (${params}),
cfg AS (SELECT *, ${months} AS months FROM cfg0),
windows AS (
 SELECT 'cur' AS w, s, e FROM cfg
 UNION ALL SELECT 'prev', ${date(add('s', '-months', 'month'))}, ${date(add('s', '-1', 'day'))} FROM cfg
 UNION ALL SELECT 'ytd', ${yearStart('s')}, e FROM cfg
 UNION ALL SELECT 'prev_ytd', ${yearStart(add('s','-months','month'))}, ${date(add('s','-1','day'))} FROM cfg
),
months AS (
 SELECT LEAST((SELECT MIN(s) FROM windows),(SELECT s FROM cfg)) AS d
 UNION ALL SELECT ${date(add('d', '1', 'month'))} FROM months WHERE ${add('d', '1', 'month')} <= (SELECT e FROM cfg)
),
licences AS (
 SELECT l.license_number AS licence_no, COALESCE(NULLIF(l.company_name_kh,''),l.company_name) AS name,
 COALESCE(NULLIF(l.province_city,''),'មិនមានទិន្នន័យ') AS province, p.licence_type,
 ${date('l.license_issue_date')} AS issued, ${date('l.license_expiry_date')} AS expires
 FROM enterprise_licenses l LEFT JOIN annex8_licence_profiles p ON p.license_number=l.license_number
),
eligible AS (
 SELECT r.*, ROW_NUMBER() OVER (PARTITION BY r.licence_no,r.period_month ORDER BY r.submitted_at DESC,r.id DESC) AS version_rank,
 (SELECT MIN(original.submitted_at) FROM annex8_reports original WHERE original.licence_no=r.licence_no AND original.period_month=r.period_month AND original.status IN ('SUBMITTED','ACCEPTED','RETURNED') AND original.submitted_at<=cfg.cutoff) AS first_received
 FROM annex8_reports r CROSS JOIN cfg
 WHERE r.status IN ('SUBMITTED','ACCEPTED') AND r.submitted_at <= cfg.cutoff
 AND r.period_month BETWEEN ${month('(SELECT MIN(s) FROM windows)')} AND ${month('cfg.e')}
),
selected AS (SELECT * FROM eligible WHERE version_rank=1),
requirements AS (
 SELECT w.w,l.*, ${month('d')} AS period_month, r.id AS report_uuid, r.report_type, r.report_id,
 CASE WHEN r.first_received >= ${pg ? '(' : ''}${add(add(add('d', '1', 'month'), '7', 'day'), '-7', 'hour')}${pg ? " AT TIME ZONE 'UTC')" : ''} THEN 1 ELSE 0 END AS is_late,
 CASE WHEN EXISTS (SELECT 1 FROM annex8_reports rr WHERE rr.licence_no=l.licence_no AND rr.period_month=${month('d')} AND rr.status='RETURNED') THEN 1 ELSE 0 END AS has_returned
 FROM windows w JOIN licences l ON l.issued<=w.e AND l.expires>=w.s
 JOIN months ON d>=w.s AND d<=w.e AND l.issued<=${date(add(add('d','1','month'),'-1','day'))} AND l.expires>=d
 LEFT JOIN selected r ON r.licence_no=l.licence_no AND r.period_month=${month('d')}
),
population AS (
 SELECT w,licence_no,name,province,licence_type, COUNT(*) AS required,
 ${count('report_uuid IS NULL')} AS missing, SUM(is_late) AS late,
 ${count("report_type='NIL'")} AS nil, ${count("report_type='AMENDMENT'")} AS amend, MAX(has_returned) AS returned,
 ${joinText('CASE WHEN report_uuid IS NULL THEN period_month ELSE NULL END')} AS missing_months,
 ${joinText('CASE WHEN is_late=1 THEN period_month ELSE NULL END')} AS late_months
 FROM requirements GROUP BY w,licence_no,name,province,licence_type
),
submission AS (
 SELECT w, COALESCE(licence_type,'UNKNOWN') AS licence_type, COUNT(*) AS active,
 ${count('missing=0')} AS submitted, ${count('missing=0 AND late=0')} AS ontime,
 ${count('missing=0 AND late>0')} AS late, ${count('missing>0')} AS notsub,
 ${count('nil>0')} AS nil, ${count('amend>0')} AS amend, ${count('returned>0')} AS returned
 FROM population GROUP BY w,licence_type
 UNION ALL SELECT w,'TOTAL',COUNT(*),${count('missing=0')},${count('missing=0 AND late=0')},${count('missing=0 AND late>0')},${count('missing>0')},${count('nil>0')},${count('amend>0')},${count('returned>0')} FROM population GROUP BY w
),
entries AS (
 SELECT r.id AS report_uuid,r.licence_no,r.period_month,i.id AS entry_id,i.op_code AS op,
 i.category,i.province,i.instrument_name,i.serial_no
 FROM selected r JOIN annex8_report_instruments i ON i.report_uuid=r.id WHERE i.deleted_at IS NULL AND r.report_type<>'NIL'
 UNION ALL SELECT r.id,r.licence_no,r.period_month,i.id,'R',i.category,i.province,i.instrument_name,i.serial_no
 FROM selected r JOIN annex8_report_repairs i ON i.report_uuid=r.id WHERE i.deleted_at IS NULL AND r.report_type<>'NIL'
),
activity AS (
 SELECT w.w,a.* FROM entries a JOIN windows w ON a.period_month BETWEEN ${month('w.s')} AND ${month('w.e')}
),
category_counts AS (
 SELECT w,category,${sums} FROM activity GROUP BY w,category
 UNION ALL SELECT w,'TOTAL',${sums} FROM activity GROUP BY w
),
licence_counts AS (SELECT w,licence_no,${sums} FROM activity GROUP BY w,licence_no),
province_counts AS (
 SELECT COALESCE(NULLIF(province,''),'មិនមានទិន្នន័យ') AS province,
 ${count("op='I'")} AS installed,${count("op='R'")} AS repairs,COUNT(*) AS total
 FROM activity WHERE w='cur' AND op IN ('I','R') GROUP BY province
),
province_total AS (SELECT ${count("op='I'")} AS installed,${count("op='R'")} AS repairs,COUNT(*) AS total FROM activity WHERE w='cur' AND op IN ('I','R')),
annex_population AS (
 SELECT * FROM population WHERE w='cur'
 UNION ALL SELECT 'cur',l.licence_no,l.name,l.province,l.licence_type,0,0,0,0,0,0,NULL,NULL FROM licences l
 WHERE EXISTS(SELECT 1 FROM activity a WHERE a.w='cur' AND a.licence_no=l.licence_no)
 AND NOT EXISTS(SELECT 1 FROM population p WHERE p.w='cur' AND p.licence_no=l.licence_no)
),
annex AS (
 SELECT p.*,COALESCE(a.m,0) AS m,COALESCE(a.i,0) AS i,COALESCE(a.r,0) AS r
 FROM annex_population p LEFT JOIN licence_counts a ON a.w=p.w AND a.licence_no=p.licence_no
),
seal_rows AS (
 SELECT r.id AS report_uuid,i.id AS entry_id,r.licence_no,i.instrument_name,i.serial_no,i.seal_removed_no,i.notification_no
 FROM selected r CROSS JOIN cfg
 JOIN annex8_report_repairs i ON i.report_uuid=r.id
 WHERE r.period_month BETWEEN ${month('cfg.s')} AND ${month('cfg.e')} AND i.deleted_at IS NULL AND i.seal_broken=${pg ? 'true' : '1'} AND r.report_type<>'NIL'
),
seals_count AS (SELECT w.w,COUNT(*) AS n FROM windows w JOIN selected r ON r.period_month BETWEEN ${month('w.s')} AND ${month('w.e')} JOIN annex8_report_repairs i ON i.report_uuid=r.id WHERE i.deleted_at IS NULL AND i.seal_broken=${pg ? 'true' : '1'} AND r.report_type<>'NIL' GROUP BY w.w),
expiry AS (SELECT w.w,COUNT(*) AS n FROM windows w JOIN licences l ON l.issued<=w.e AND l.expires>w.e AND l.expires<=${date(add('w.e','90','day'))} GROUP BY w.w),
diagnostics AS (
 SELECT
 (SELECT COUNT(*) FROM licences WHERE issued IS NULL OR expires IS NULL OR issued>expires) AS invalid_validity,
 (SELECT COUNT(*) FROM selected r LEFT JOIN licences l ON l.licence_no=r.licence_no WHERE l.licence_no IS NULL) AS orphan_reports,
 (SELECT COUNT(*) FROM eligible a WHERE a.report_type='AMENDMENT' AND 1 <> (
   SELECT COUNT(*) FROM annex8_reports root WHERE root.licence_no=a.licence_no AND root.period_month=a.period_month
   AND root.report_type<>'AMENDMENT' AND root.status IN ('SUBMITTED','ACCEPTED','RETURNED') AND (root.report_id=a.original_report_id OR ${pg ? 'CAST(root.id AS TEXT)' : 'root.id'}=a.original_report_id)
   AND root.submitted_at IS NOT NULL AND root.submitted_at<=a.submitted_at)) AS invalid_amendments,
 (SELECT COUNT(*) FROM annex8_reports CROSS JOIN cfg WHERE status IN ('SUBMITTED','ACCEPTED') AND submitted_at IS NULL AND period_month BETWEEN ${month('(SELECT MIN(s) FROM windows)')} AND ${month('cfg.e')}) AS missing_receipts,
 (SELECT COUNT(*) FROM activity WHERE category IS NULL OR category NOT IN ('NAWI','WEIGHBRIDGE','WEIGHTS','FUEL_DISPENSER','LPG_DISPENSER','ELEC_METER','WATER_METER','EV_CHARGER','OTHER')) AS unknown_categories,
 (SELECT COUNT(*) FROM selected r WHERE r.report_type='NIL' AND (EXISTS(SELECT 1 FROM annex8_report_instruments i WHERE i.report_uuid=r.id AND i.deleted_at IS NULL) OR EXISTS(SELECT 1 FROM annex8_report_repairs i WHERE i.report_uuid=r.id AND i.deleted_at IS NULL))) AS nil_with_activity
)
SELECT ${json(`'version',1,'data_as_of',(SELECT ${pg ? 'cutoff' : "CONCAT(DATE_FORMAT(cutoff,'%Y-%m-%dT%H:%i:%s.%f'),'Z')"} FROM cfg),
 'submission',${array('submission',json("'window',w,'type',licence_type,'active',active,'submitted',submitted,'ontime',ontime,'late',late,'notsub',notsub,'nil',nil,'amend',amend,'returned',returned"))},
 'categories',${array('category_counts',json(`'window',w,'category',category,${totalsJson()}`))},
 'licensees',${array('annex',json(`'licence_no',licence_no,'name',name,'province',province,'type',licence_type,'required',required,'missing',missing,'late',late,'missing_months',missing_months,'late_months',late_months,${totalsJson()}`))},
 'provinces',${array('province_counts',json("'province',province,'installed',installed,'repairs',repairs,'total',total"))},
 'province_total',(SELECT ${json("'installed',COALESCE(installed,0),'repairs',COALESCE(repairs,0),'total',total")} FROM province_total),
 'seals',${array('seal_rows',json("'entry_id',entry_id,'licence_no',licence_no,'instrument',instrument_name,'serial_no',serial_no,'seal_no',seal_removed_no,'notification_no',notification_no"))},
 'seal_counts',${array('seals_count',json("'window',w,'count',n"))},
 'expiry',${array('expiry',json("'window',w,'count',n"))},
 'diagnostics',(SELECT ${json("'invalid_validity',invalid_validity,'orphan_reports',orphan_reports,'invalid_amendments',invalid_amendments,'missing_receipts',missing_receipts,'unknown_categories',unknown_categories,'nil_with_activity',nil_with_activity")} FROM diagnostics),
 'sources',${array("selected",json("'id',id,'report_id',report_id,'licence_no',licence_no,'period_month',period_month"))}`)} AS result`;
}
