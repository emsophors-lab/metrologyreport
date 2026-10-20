import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import PizZip from 'pizzip';
import { Jimp } from 'jimp';
import jsQR from 'jsqr';
import { createMysqlClient } from '../src/db/mysqlClient';
import { sha256 } from '../src/reports/issuance';

if (!process.env.MYSQL_URL || !['localhost', '127.0.0.1'].includes(new URL(process.env.MYSQL_URL).hostname)) throw new Error('Loopback MySQL only');
// Suppress automatic app.listen without enabling production header restrictions.
// This is only an isolated loopback test harness, never a deployment setting.
process.env.VERCEL = 'local-test-harness';
process.env.NODE_ENV = 'test';
process.env.DB_DRIVER = 'mysql';
process.env.ALLOW_LEGACY_API_HEADER_AUTH = 'true';
process.env.REPORT_QR_ENABLED = 'true';
const db = createMysqlClient(process.env.MYSQL_URL);
const { default: app } = await import('../server');
const server = http.createServer(app);
server.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address(); assert.ok(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
process.env.REPORT_VERIFICATION_ORIGIN = base;
const ids: string[] = [];
let failed = false;
try {
  const users = await db.from('users').select('id,username,role,license_number'); assert.equal(users.error, null);
  const staff = users.data.find((user: any) => user.role === 'superadmin');
  const company = users.data.find((user: any) => user.role === 'company' && user.license_number);
  assert.ok(staff && company);
  const headers = (user: any) => ({ 'Content-Type': 'application/json', 'X-NMC-User-ID': user.id,
    'X-NMC-Username': user.username, 'X-NMC-User-Role': user.role });
  const path = base + '/api/report-issuance/export';
  assert.equal((await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  const sample = JSON.parse(fs.readFileSync('src/lib/consolidated/__fixtures__/consolidated-sample-data.json', 'utf8'));
  const body = JSON.stringify({ kind: 'consolidated', format: 'docx', data: sample, sample: true });
  assert.equal((await fetch(path, { method: 'POST', headers: headers(company), body })).status, 403);
  const response = await fetch(path, { method: 'POST', headers: headers(staff), body });
  assert.equal(response.status, 200, response.status !== 200 ? await response.text() : '');
  const id = response.headers.get('X-NMC-Issuance-ID')!; assert.ok(id); ids.push(id);
  const bytes = Buffer.from(await response.arrayBuffer());
  const zip = new PizZip(bytes);
  const image = await Jimp.read(zip.file(`word/media/mlrs-qr-${id}.png`)!.asNodeBuffer());
  const url = jsQR(new Uint8ClampedArray(image.bitmap.data), image.bitmap.width, image.bitmap.height)?.data;
  assert.ok(url?.startsWith(base + '/api/report-issuance/check/'));
  const page = await fetch(url!); assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy') || '', /nonce-/);
  assert.ok((await page.text()).includes('Check Downloaded File'));
  const token = url!.split('/').pop()!;
  const verified = await (await fetch(`${base}/api/report-issuance/verify/${token}?sha256=${sha256(bytes)}`)).json();
  assert.equal(verified.file_match, true); assert.equal(verified.basis, 'draft');
  assert.ok(!('source_snapshot' in verified));
  const changed = await (await fetch(`${base}/api/report-issuance/verify/${token}?sha256=${sha256('modified')}`)).json();
  assert.equal(changed.file_match, false);
  assert.equal((await fetch(base + '/api/report-issuance/verify/' + 'a'.repeat(43))).status, 404);
  console.log('PASS: actual API staff export, company denial, anonymous denial, scanned URL, public private-field exclusion, exact-file match and changed-file rejection. No Telegram requests.');
  if (process.argv.includes('--preview')) {
    console.log(`Temporary verification preview: ${url}`);
    await new Promise(resolve => setTimeout(resolve, 120_000));
  }
} catch (error) { failed = true; console.error(error); }
finally {
  for (const id of ids) { const result = await db.from('report_issuances').delete().eq('id', id); if (result.error) { failed = true; console.error(result.error); } }
  await db.end();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
// The app's own MySQL pool is intentionally private; close its remaining test handles.
process.exit(failed ? 1 : 0);
