import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import mysql from 'mysql2/promise';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import PizZip from 'pizzip';
import { Jimp } from 'jimp';
import jsQR from 'jsqr';
import { FEATURE_KEYS } from '../src/ml/portable';
import { parseAuditFilters, auditFiltersFromUrl } from '../src/ml/auditService';
import { sha256 } from '../src/reports/issuance';

const url = new URL(process.env.MYSQL_URL!);
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Loopback MySQL test only');
const name = `ml_export_test_${Date.now()}`;
const admin = await mysql.createConnection(url.toString());
let server: http.Server | undefined;
let failed = false;
const directory = path.resolve('test-output/ml-audit');
const sheets = ['Executive_Summary_&_Metadata', 'Supervised_Predictions', 'Unsupervised_Anomalies', 'Cluster_Profiles'];
try {
  assert.throws(() => parseAuditFilters({from:'2026-02-30'}));
  assert.throws(() => parseAuditFilters({q:['a','b']}));
  assert.throws(() => parseAuditFilters({from:'2026-09-01',to:'2026-08-01'}));
  assert.throws(() => parseAuditFilters({unexpected:'value'}));
  assert.deepEqual(auditFiltersFromUrl('/api/analytics/ml-insights?from=2026-10-01&to=2026-10-31'), {from:'2026-10-01',to:'2026-10-31'});
  assert.throws(() => auditFiltersFromUrl('/api/analytics/ml-insights?q=a&q=b'));
  assert.throws(() => auditFiltersFromUrl('/api/analytics/ml-insights?path=unexpected'));
  await admin.query(`CREATE DATABASE \`${name}\``);
  url.pathname = '/' + name;
  await admin.query(`CREATE TABLE \`${name}\`.users(id varchar(36) primary key, username text, role text, is_active boolean)`);
  await admin.query(`INSERT INTO \`${name}\`.users VALUES ('staff','test-staff','admin',true),('company','test-company','company',true)`);
  await admin.query(`CREATE TABLE \`${name}\`.enterprise_licenses(id varchar(36) primary key, license_number text, company_name text, company_name_kh text, measuring_instrument_type text, license_expiry_date text)`);
  await admin.query(`INSERT INTO \`${name}\`.enterprise_licenses VALUES ('l1','LIC-TEST','Audit Test Enterprise','សហគ្រាសសាកល្បង','Scale','2027-12-31')`);
  await admin.query(`CREATE TABLE \`${name}\`.annex8_reports(id varchar(36) primary key, status text, licence_no text, period_month text, report_id text, submitted_at text, on_time boolean)`);
  await admin.query(`INSERT INTO \`${name}\`.annex8_reports VALUES ('r1','ACCEPTED','LIC-TEST','2026-09','NMC-TEST-001','2026-10-02T00:00:00Z',true),('r2','DRAFT','LIC-TEST','2026-10','DRAFT-MUST-NOT-APPEAR','2026-10-03T00:00:00Z',false),('r3','ACCEPTED','LIC-TEST','2026-08','NMC-TEST-003','2026-09-01T00:00:00Z',false)`);
  await admin.query(`CREATE TABLE \`${name}\`.annex8_report_instruments(id varchar(36) primary key, report_uuid varchar(36), instrument_name text, category text, serial_no text, op_code text)`);
  await admin.query(`CREATE TABLE \`${name}\`.annex8_report_repairs(id varchar(36) primary key, report_uuid varchar(36), instrument_name text, category text, serial_no text)`);
  for (let i = 0; i < 55; i++) await admin.query(`INSERT INTO \`${name}\`.annex8_report_instruments VALUES (?,?,?,?,?,?)`,
    [`i${i}`, 'r1', i === 0 ? '=HYPERLINK("https://invalid.test","not a formula")' : `Scale equipment ${i} with a long evidence description to exercise wrapping`, 'Scale', `SERIAL-${i}`, 'M']);
  await admin.query(`INSERT INTO \`${name}\`.annex8_report_instruments VALUES ('draft-instrument','r2','Draft Scale','Scale','DRAFT-ONLY','I')`);
  await admin.query(`CREATE TABLE \`${name}\`.ml_lifecycle(id varchar(36) primary key, revision bigint default 0, payload json)`);
  const tree = {left:[-1],right:[-1],feature:[-2],threshold:[-2],value:[0.7],samples:[2]};
  const dim = FEATURE_KEYS.length;
  const model = {schema:1, features:FEATURE_KEYS, forest:[tree], isolation:[tree], isolationSamples:25, anomalyThreshold:0.5,
    centers:[Array(dim).fill(0),Array(dim).fill(10)],mean:Array(dim).fill(0),scale:Array(dim).fill(1),
    pca:{mean:Array(dim).fill(0),components:[Array.from({length:dim},(_,i)=>i===0?1:0),Array.from({length:dim},(_,i)=>i===1?1:0)],explainedVariance:[0.6,0.2]}};
  const active = { id:'audit-test-model', model, trainedAt:'2026-10-01T00:00:00Z', trainedReportCount:25,
    reportIds:['r1'],fingerprint:'test-evidence',metrics:{f1:0.8,accuracy:0.85,silhouette:0.6,anomalyStability:0.9,labelSource:'Synthetic test proxy labels'} };
  await admin.query(`INSERT INTO \`${name}\`.ml_lifecycle VALUES ('main',0,?)`,[JSON.stringify({active})]);
  await admin.query(`CREATE TABLE \`${name}\`.report_issuances(id varchar(36) primary key, token_hash varchar(64), artifact_sha256 varchar(64), source_sha256 varchar(64), report_kind text,file_format text,title text,company_name text,licence_no text,period_label text,issued_at text,issued_by text,state text,basis text,source_snapshot json)`);
  Object.assign(process.env,{ DB_DRIVER:'mysql',MYSQL_URL:url.toString(),VERCEL:'local-test-harness',NODE_ENV:'test',
    ALLOW_LEGACY_API_HEADER_AUTH:'true',ML_LIFECYCLE_ENABLED:'true',REPORT_QR_ENABLED:'true',REPORT_VERIFICATION_ORIGIN:'http://127.0.0.1:34567' });
  const {default: app} = await import('../server');
  server = http.createServer((req: any, res) => {
    // Vercel can prepopulate query with rewrite params; user filters live in the URL.
    req.query = { ...Object.fromEntries(new URL(req.url, 'http://localhost').searchParams), path: 'analytics/ml-insights' };
    app(req, res);
  }).listen(0,'127.0.0.1');
  await new Promise<void>(r=>server!.once('listening',r));
  const address = server.address();assert.ok(address && typeof address!=='string');
  const base = `http://127.0.0.1:${address.port}`;
  const headers = (id:string,role:string) => ({'X-NMC-User-ID':id,'X-NMC-Username':`test-${id}`,'X-NMC-User-Role':role});
  assert.equal((await fetch(base+'/api/analytics/ml-insights')).status,401);
  assert.equal((await fetch(base+'/api/analytics/ml-insights',{headers:headers('company','company')})).status,403);
  const insights=await fetch(base+'/api/analytics/ml-insights?from=2026-10-01&to=2026-10-31&organization_id=l1&risk_level=High&instrument_type=Scale',{headers:headers('staff','admin')});
  assert.equal(insights.status,200);assert.equal(insights.headers.get('cache-control'),'no-store');
  const insightData:any=await insights.json();
  assert.equal(insightData.executive_briefing.engine,'deterministic-v1');
  assert.equal(insightData.executive_briefing.evidence.report_count,1);
  assert.ok(insightData.executive_briefing.action_items.some((a:any)=>a.targets.some((t:any)=>t.reportId==='NMC-TEST-001')));
  const emptyInsights:any=await (await fetch(base+'/api/analytics/ml-insights?q=NO_MATCH_EXPECTED',{headers:headers('staff','admin')})).json();
  assert.equal(emptyInsights.executive_briefing.evidence.report_count,0);
  await fs.mkdir(directory,{recursive:true});
  for (const format of ['pdf','excel']) {
    const endpoint = base + '/api/analytics/export/' + format;
    assert.equal((await fetch(endpoint)).status,401);
    assert.equal((await fetch(endpoint,{headers:headers('company','company')})).status,403);
    assert.equal((await fetch(endpoint+'?from=2026-02-30',{headers:headers('staff','admin')})).status,400);
    const response = await fetch(endpoint+'?from=2026-10-01&to=2026-10-31&organization_id=l1&risk_level=High&instrument_type=Scale', {headers:headers('staff','admin')});
    assert.equal(response.status,200, response.status!==200?await response.text():'');
    assert.match(response.headers.get('content-disposition')||'',/attachment; filename="Metrology_ML_Audit_/);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const bytes=Buffer.from(await response.arrayBuffer());assert.ok(bytes.length>1000);
    const id=response.headers.get('x-nmc-issuance-id');assert.ok(id);
    const [records]:any=await admin.query(`SELECT * FROM \`${name}\`.report_issuances WHERE id=?`,[id]);
    assert.equal(records[0].artifact_sha256,sha256(bytes));
    const snapshot=typeof records[0].source_snapshot==='string'?JSON.parse(records[0].source_snapshot):records[0].source_snapshot;
    assert.equal(snapshot.reportCount,1);assert.equal(snapshot.rows.length,55);
    assert.equal(snapshot.executive_briefing.engine,'deterministic-v1');
    assert.equal(snapshot.executive_briefing.summary_paragraph,insightData.executive_briefing.summary_paragraph);
    assert.equal(snapshot.rows[0].riskLevel,'High');assert.equal(snapshot.rows[0].currentErrorRatio,null);
    assert.ok(!JSON.stringify(snapshot).includes('DRAFT-MUST-NOT-APPEAR'));
    if(format==='pdf') {
      assert.match(response.headers.get('content-type')||'',/application\/pdf/);
      assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
      const pdf=await PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>=3);
      await fs.writeFile(path.join(directory,'audit.pdf'),bytes);
    } else {
      assert.match(response.headers.get('content-type')||'',/spreadsheetml/);
      const book=new ExcelJS.Workbook();await book.xlsx.load(bytes as any);
      assert.deepEqual(book.worksheets.map(s=>s.name),sheets);
      const summaryValues=JSON.stringify(book.worksheets[0].getSheetValues());
      assert.ok(summaryValues.includes(snapshot.executive_briefing.summary_paragraph));
      assert.ok(summaryValues.includes('Quantified scope:'));
      assert.ok(book.worksheets[1].views.some(v=>v.state==='frozen'));
      assert.ok(book.worksheets[0].getImages().length>=3,'QR and chart images are embedded');
      const zip=new PizZip(bytes);
      const xml=Object.keys(zip.files).filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n)).map(n=>zip.file(n)!.asText()).join('');
      assert.ok(!/<f[ >]/.test(xml),'Raw strings must not become executable formulas');
      let qr=false;
      for(const file of Object.keys(zip.files).filter(n=>n.startsWith('xl/media/')&&/\.png$/.test(n))) {
        const img=await Jimp.read(zip.file(file)!.asNodeBuffer());
        const code=jsQR(new Uint8ClampedArray(img.bitmap.data),img.bitmap.width,img.bitmap.height);
        if(code?.data.includes('/api/report-issuance/check/')) {
          qr=true;
          const verified=await (await fetch(base+'/api/report-issuance/verify/'+code.data.split('/').pop()+'?sha256='+sha256(bytes))).json();
          assert.equal(verified.file_match,true);
        }
      }
      assert.ok(qr);await fs.writeFile(path.join(directory,'audit.xlsx'),bytes);
    }
    const empty=await fetch(endpoint+'?q=NO_MATCH_EXPECTED',{headers:headers('staff','admin')});
    assert.equal(empty.status,200);
  }
  process.env.ML_LIFECYCLE_ENABLED='false';
  const cold=await fetch(base+'/api/analytics/export/excel',{headers:headers('staff','admin')});assert.equal(cold.status,200);
  const coldBook=new ExcelJS.Workbook();await coldBook.xlsx.load(Buffer.from(await cold.arrayBuffer()) as any);
  assert.equal(coldBook.getWorksheet('Unsupervised_Anomalies')!.rowCount,57,'Cold-start sheet includes all unscored records, not just outliers');
  const coldId=cold.headers.get('x-nmc-issuance-id');
  const [coldRows]:any=await admin.query(`SELECT source_snapshot FROM \`${name}\`.report_issuances WHERE id=?`,[coldId]);
  const coldData=typeof coldRows[0].source_snapshot==='string'?JSON.parse(coldRows[0].source_snapshot):coldRows[0].source_snapshot;
  assert.equal(coldData.status,'Cold-Start Baseline');assert.equal(coldData.rows[0].riskProbability,null);
  process.env.REPORT_QR_ENABLED='false';
  assert.equal((await fetch(base+'/api/analytics/export/pdf',{headers:headers('staff','admin')})).status,503);
  console.log('PASS: actual authenticated PDF/Excel APIs, attachment/MIME/bytes, four sheets, embedded charts/QR, file-hash verification, pagination, filters, empty results, cold start, formula safety, staff permissions and QR fail-closed. Existing database and Telegram untouched.');
} catch(error) {failed=true;console.error(error);}
finally {
  if(server)await new Promise<void>(r=>server!.close(()=>r()));
  await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);await admin.end();
}
process.exit(failed?1:0);
