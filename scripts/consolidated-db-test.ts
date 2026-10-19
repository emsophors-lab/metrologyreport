import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { consolidatedAggregationSql } from '../src/lib/consolidated/aggregationSql';
import { consolidatedMigrationSql } from '../src/lib/consolidated/migrationSql';
import { formatConsolidatedAggregate } from '../src/lib/consolidated/aggregateResult';
import { automaticConsolidatedInputs } from '../src/lib/consolidated/automaticReport';
import { prepareConsolidatedData } from '../src/lib/consolidated/buildConsolidatedData';
import { fillConsolidatedTemplate } from '../src/lib/consolidated/consolidatedDocx';
import { reportingPeriod } from '../src/lib/consolidated/periods';
import type { ConsolidatedSqlResult } from '../src/lib/consolidated/aggregateResult';

dotenv.config();
const pg = await PGlite.create();
let my: mysql.Connection | undefined;
const testDatabase = 'mlrs_consolidated_test_' + crypto.randomBytes(8).toString('hex');
let createdTestDatabase = false;
const period = reportingPeriod('QUARTER',2026,1);
const cutoff = '2026-04-15T00:00:00.000Z';
const schemas: Record<string,string> = {
  enterprise_licenses: 'license_number VARCHAR(190),company_name TEXT,company_name_kh TEXT,province_city TEXT,license_issue_date DATE,license_expiry_date DATE',
  annex8_licence_profiles: 'license_number VARCHAR(190),licence_type VARCHAR(32)',
  annex8_reports: 'id VARCHAR(64),report_id VARCHAR(64),licence_no VARCHAR(190),period_month VARCHAR(16),status VARCHAR(32),report_type VARCHAR(32),original_report_id VARCHAR(64),submitted_at TIMESTAMPTZ',
  annex8_report_instruments: 'id VARCHAR(64),report_uuid VARCHAR(64),op_code VARCHAR(1),category VARCHAR(32),province TEXT,instrument_name TEXT,serial_no VARCHAR(64),deleted_at TIMESTAMPTZ',
  annex8_report_repairs: 'id VARCHAR(64),report_uuid VARCHAR(64),category VARCHAR(32),province TEXT,instrument_name TEXT,serial_no VARCHAR(64),deleted_at TIMESTAMPTZ,seal_broken BOOLEAN,seal_removed_no TEXT,notification_no TEXT',
};
const toMysql = (value: any) => typeof value==='string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.replace('T',' ').replace(/Z$/,'') : value;
async function insert(table: string, row: Record<string,any>) {
  const columns = Object.keys(row), values = Object.values(row);
  await pg.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_,i)=>'$'+(i+1)).join(',')})`,values);
  if (my) await my.execute(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,values.map(toMysql));
}
async function execute(sql: string) { await pg.exec(sql); if (my) await my.query(sql); }
async function read(requested = period) {
  const p = (await pg.query<{result:ConsolidatedSqlResult}>(consolidatedAggregationSql('postgresql'),[requested.start,requested.end,cutoff])).rows[0].result;
  const preview = formatConsolidatedAggregate(p,requested,'postgresql');
  if (my) {
    const [rows] = await my.query(consolidatedAggregationSql('mysql'),[requested.start,requested.end,toMysql(cutoff)]);
    const raw = (rows as any[])[0].result;
    const m = formatConsolidatedAggregate(typeof raw==='string' ? JSON.parse(raw) : raw,requested,'mysql');
    assert.deepEqual(m.data,preview.data,'PostgreSQL and MySQL formatted aggregates must agree');
    assert.equal(m.data_as_of,preview.data_as_of,'UTC SQL cutoff must not be reinterpreted in the server host timezone');
  }
  return preview;
}
async function licence(id:string,issued='2025-01-01',expires='2026-12-31',type:string|null='MANUF_INSTALL') {
  await insert('enterprise_licenses',{license_number:id,company_name:id,company_name_kh:'សហគ្រាស '+id,province_city:'ភ្នំពេញ',license_issue_date:issued,license_expiry_date:expires});
  if (type) await insert('annex8_licence_profiles',{license_number:id,licence_type:type});
}
async function report(id:string,licence_no:string,period_month:string,submitted_at:string,status='SUBMITTED',report_type='REGULAR',original_report_id:string|null=null) {
  await insert('annex8_reports',{id,report_id:'R-'+id,licence_no,period_month,submitted_at,status,report_type,original_report_id});
}
async function instrument(id:string,report_uuid:string,op_code='M',category='NAWI',deleted_at:string|null=null) {
  await insert('annex8_report_instruments',{id,report_uuid,op_code,category,province:'ភ្នំពេញ',instrument_name:'Test '+id,serial_no:id,deleted_at});
}
try {
  // Only a new, randomly named loopback test database may be written.
  // Application tables/data remain untouched.
  if (process.argv.includes('--mysql')) {
    if (!process.env.MYSQL_URL) throw new Error('MYSQL_URL not configured');
    const url = new URL(process.env.MYSQL_URL);
    if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Local tests refuse non-loopback MySQL');
    my = await mysql.createConnection({uri:process.env.MYSQL_URL,dateStrings:true,timezone:'Z'});
    await my.query("SET time_zone='+00:00'");
    await my.query(`CREATE DATABASE \`${testDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    createdTestDatabase = true;
    await my.query(`USE \`${testDatabase}\``);
  }
  for (const [table,columns] of Object.entries(schemas)) {
    await pg.exec(`CREATE TABLE ${table} (${columns})`);
    if (my) await my.query(`CREATE TABLE ${table} (${columns.replaceAll('TIMESTAMPTZ','DATETIME(3)')})`);
  }
  let preview = await read();
  assert.equal(preview.data.total_m,0);
  assert.equal(preview.data.kpi_active_cur,0);
  assert.equal(preview.data.kpi_sub_rate_cur,null,'Zero denominator is unavailable, not 0%');
  assert.equal(preview.data.total_failed,null,'Unreconstructable historical verification is not zero');
  assert.deepEqual(preview.data.licensees,[]);

  await licence('A'); await licence('B','2025-01-01','2026-12-31','REPAIR');
  await licence('C','2026-02-15','2026-02-28');
  await licence('EXPIRED','2025-01-01','2025-12-31');
  await report('a-original','A','2026-01','2026-02-05T00:00:00Z','RETURNED');
  await instrument('replaced-original','a-original');
  await report('a-amend','A','2026-01','2026-02-20T00:00:00Z','ACCEPTED','AMENDMENT','R-a-original');
  await instrument('a1','a-amend','M','WEIGHBRIDGE'); await instrument('a2','a-amend','M','WEIGHBRIDGE');
  await instrument('deleted','a-amend','M','NAWI',cutoff);
  await report('a-feb','A','2026-02','2026-03-08T00:00:00Z');
  await instrument('a3','a-feb','I','WATER_METER');
  await report('a-mar','A','2026-03','2026-04-01T00:00:00Z','SUBMITTED','NIL');
  await report('b-jan','B','2026-01','2026-02-01T00:00:00Z');
  await insert('annex8_report_repairs',{id:'b1',report_uuid:'b-jan',category:'FUEL_DISPENSER',province:'ខេត្តកំពត',instrument_name:'Fuel',serial_no:'b1',deleted_at:null,seal_broken:true,seal_removed_no:'SEAL1',notification_no:'NOTICE1'});
  await report('b-mar','B','2026-03','2026-04-07T17:00:00Z');
  await instrument('b2','b-mar','I');
  await report('draft','A','2026-03','2026-04-01T00:00:00Z','OPEN');
  await instrument('not-submitted','draft');
  await report('expired','EXPIRED','2026-02','2026-03-01T00:00:00Z');
  await instrument('outside-validity','expired');
  preview = await read();
  assert.equal(preview.data.sub_active_total,3);
  assert.equal(preview.data.sub_submitted_total,1);
  assert.equal(preview.data.sub_late_total,1,'Missing wins over late in exclusive classification');
  assert.equal(preview.data.sub_notsub_total,2);
  assert.equal(preview.data.sub_nil_total,1);
  assert.equal(preview.data.sub_amend_total,1);
  assert.equal(preview.data.total_m,3,'Latest amendment only, soft delete excluded, accepted out-of-validity activity retained');
  assert.equal(preview.data.total_i,2); assert.equal(preview.data.total_r,1);
  assert.equal(preview.data.total_m,preview.data.lic_total_m);
  assert.equal(preview.data.prov_total_installed,2); assert.equal(preview.data.prov_total_repairs,1);
  assert.equal(preview.data.seals.length,1);
  assert.equal(preview.data.kpi_seals_cur,1);
  assert.ok(preview.data.late_list.find(row=>row.licence_no==='B')!.status_kh.toString().includes('យឺត'));
  assert.equal(preview.data.licensees.length,4);
  assert.equal(preview.data.licensees.find(row=>row.licence_no==='EXPIRED')!.status_kh,'មិនតម្រូវក្នុងរយៈពេល');
  assert.equal(preview.source_manifest.filter(row=>row.licence_no==='A' && row.period_month==='2026-01').length,1);
  assert.equal(preview.source_manifest.find(row=>row.licence_no==='A' && row.period_month==='2026-01')!.id,'a-amend');
  // The amendment date does not erase the original on-time receipt.
  assert.equal(preview.data.licensees.find(row=>row.licence_no==='A')!.remark,'');
  await execute("UPDATE annex8_reports SET submitted_at='2026-03-07 16:59:59' WHERE id='a-feb'");
  preview = await read();
  assert.equal(preview.data.sub_ontime_total,1);
  assert.equal(preview.data.sub_late_total,0,'Cambodia 7th 23:59:59 is on time');
  await licence('UNKNOWN-TYPE','2026-01-01','2026-12-31',null);
  preview = await read();
  assert.equal(preview.data.sub_active_total,4);
  assert.equal(preview.data.sub_active_mi,null,'Do not invent unknown licence classification');
  await instrument('invalid-nil','a-mar');
  await assert.rejects(() => read(),/nil_with_activity/);
  await execute("DELETE FROM annex8_report_instruments WHERE id='invalid-nil'");
  await execute("UPDATE annex8_reports SET original_report_id='NO-ROOT' WHERE id='a-amend'");
  await assert.rejects(() => read(),/invalid_amendments/);
  await execute("UPDATE annex8_reports SET original_report_id='R-a-original' WHERE id='a-amend'");
  await report('orphan','NO-LICENCE','2026-01','2026-02-01T00:00:00Z');
  await assert.rejects(() => read(),/orphan_reports/);
  await execute("DELETE FROM annex8_reports WHERE id='orphan'");
  await execute("UPDATE annex8_report_instruments SET category='UNRECOGNIZED' WHERE id='a1'");
  await assert.rejects(() => read(),/unknown_categories/);
  await execute("UPDATE annex8_report_instruments SET category='WEIGHBRIDGE' WHERE id='a1'");
  const january = await read(reportingPeriod('MONTH',2026,1));
  assert.equal(january.previous.key,'2025-12');
  assert.equal(january.data.total_m,2); assert.equal(january.data.total_r,1);
  for (const type of ['SEMESTER','YEAR'] as const) {
    const other = await read(reportingPeriod(type,2026,1));
    assert.equal(other.data.total_m,3); assert.equal(other.data.total_i,2); assert.equal(other.data.total_r,1);
    assert.equal(other.data.total_m,other.data.lic_total_m);
  }
  for (let i=0;i<1050;i++) await licence(`BULK-${String(i).padStart(4,'0')}`);
  preview = await read();
  assert.equal(preview.data.sub_active_total,1054,'No default 1000-row truncation');
  assert.equal(preview.data.licensees.length,1055);
  const now = new Date(cutoff);
  const formatted = prepareConsolidatedData(preview.data,period,automaticConsolidatedInputs(preview.data,period,{},now));
  const template = fs.readFileSync('public/templates/Consolidated_template_v1.docx');
  fs.mkdirSync('test-output',{recursive:true});
  fs.writeFileSync('test-output/Consolidated_DATABASE_FIXTURE.docx',fillConsolidatedTemplate(template,formatted).getZip().generate({type:'nodebuffer',compression:'DEFLATE'}));
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await pg.exec(consolidatedMigrationSql());
  const rpc = (await pg.query<{result:ConsolidatedSqlResult}>("SELECT public.mlrs_consolidated_preview('QUARTER',2026,1) AS result")).rows[0].result;
  assert.equal(formatConsolidatedAggregate(rpc,period,'postgresql').data.sub_active_total,1054);
  await assert.rejects(pg.query("SELECT public.mlrs_consolidated_preview('INVALID',2026,1)"));
  await pg.exec('SET ROLE authenticated');
  await assert.rejects(pg.query("SELECT public.mlrs_consolidated_preview('MONTH',2026,1)"),/permission denied/);
  await pg.exec('RESET ROLE; SET ROLE anon');
  await assert.rejects(pg.query("SELECT public.mlrs_consolidated_preview('MONTH',2026,1)"),/permission denied/);
  await pg.exec('RESET ROLE');
  console.log('PASS: real local PostgreSQL SQL/RPC, optional MySQL parity, amendment selection, first receipt, missing precedence, NIL, soft delete, partial licence months, orphan guard, unknown history/type, reconciliation, 1050+ licensees, browser-data contract, DOCX and denied anon/company RPC. MySQL parity: '+Boolean(my));
} finally {
  if (my && createdTestDatabase && /^mlrs_consolidated_test_[0-9a-f]{16}$/.test(testDatabase)) await my.query(`DROP DATABASE \`${testDatabase}\``);
  await my?.end(); await pg.close();
}
