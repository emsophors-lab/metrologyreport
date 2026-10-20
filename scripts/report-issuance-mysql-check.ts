import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMysqlClient } from '../src/db/mysqlClient';
import { createIssuedExport } from '../src/reports/issuedExports';
import { lookupIssuance, sha256 } from '../src/reports/issuance';

if (!process.env.MYSQL_URL || !['127.0.0.1', 'localhost'].includes(new URL(process.env.MYSQL_URL).hostname))
  throw new Error('This check only runs on the existing local MySQL database.');
process.env.REPORT_VERIFICATION_ORIGIN = 'http://localhost:3004';
const db = createMysqlClient(process.env.MYSQL_URL);
const issuedIds: string[] = [];
try {
  const before = await db.from('annex8_reports').select('id');
  assert.equal(before.error, null);
  const { data: companies, error } = await db.from('users').select('id,license_number').eq('role', 'company');
  assert.equal(error, null);
  const company = companies.find((row: any) => row.license_number);
  assert.ok(company);
  const reports = await db.from('annex8_reports').select('id,status').eq('licence_no', company.license_number);
  assert.equal(reports.error, null);
  const report = reports.data[0]; assert.ok(report);
  const result = await createIssuedExport(db, company.id, [company.license_number], { kind: 'annex8', format: 'docx', id: report.id });
  issuedIds.push(result.seal.id);
  const token = result.seal.url.split('/').pop()!;
  const verified = await lookupIssuance(db, token, sha256(result.bytes));
  assert.equal(verified.status, 200);
  assert.equal(verified.body.file_match, true);
  assert.equal(verified.body.licence, company.license_number);
  assert.ok(!('source_snapshot' in verified.body));
  await assert.rejects(createIssuedExport(db, company.id, ['DIFFERENT-LICENCE'], { kind: 'annex8', format: 'docx', id: report.id }),
    (error: any) => error.status === 403);
  const sample = JSON.parse(fs.readFileSync('src/lib/consolidated/__fixtures__/consolidated-sample-data.json', 'utf8'));
  const consolidated = await createIssuedExport(db, 'local-test', null, { kind: 'consolidated', format: 'docx', data: sample, sample: true });
  issuedIds.push(consolidated.seal.id);
  assert.equal((await lookupIssuance(db, consolidated.seal.url.split('/').pop()!, sha256(consolidated.bytes))).body.file_match, true);
  const after = await db.from('annex8_reports').select('id');
  assert.deepEqual(after.data, before.data, 'No operational reports are changed');
  console.log('PASS: local MySQL issuance insert/read, real Annex 8 rendering, exact file hash, company ownership, draft consolidated export, operational reports unchanged.');
} finally {
  for (const id of issuedIds) {
    const { error } = await db.from('report_issuances').delete().eq('id', id);
    assert.equal(error, null);
  }
  await db.end();
}
