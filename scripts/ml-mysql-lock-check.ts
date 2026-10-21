import 'dotenv/config';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import http from 'node:http';
import { createMysqlClient } from '../src/db/mysqlClient';
import { LifecycleStore } from '../src/ml/lifecycle';

const url = new URL(process.env.MYSQL_URL!);
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Loopback MySQL test only');
const name = `ml_lock_test_${Date.now()}`;
const admin = await mysql.createConnection(url.toString());
let db: ReturnType<typeof createMysqlClient> | undefined;
let server: http.Server | undefined;
let failure = false;
try {
  await admin.query(`CREATE DATABASE \`${name}\``);
  url.pathname = '/' + name;
  db = createMysqlClient(url.toString());
  await admin.query(`CREATE TABLE \`${name}\`.ml_lifecycle(id varchar(36) primary key, revision bigint default 0, payload json)`);
  await admin.query(`INSERT INTO \`${name}\`.ml_lifecycle VALUES ('main',0,'{}')`);
  const a = new LifecycleStore(db), b = new LifecycleStore(db);
  const tokens = await Promise.all([a.claim(), b.claim()]);
  assert.equal(tokens.filter(Boolean).length, 1);
  const token = tokens.find(Boolean)!;
  await b.signal(true);
  assert.equal(await a.heartbeat(token), true);
  assert.equal(await b.finish('invalid-token', { lastError: 'must not publish' }), false);
  assert.equal(await a.finish(token, { lastOutcome: 'tested' }), true);
  const state = (await b.read()).state;
  assert.ok(state.manual);
  assert.equal(state.lock, undefined);
  assert.equal(state.lastOutcome, 'tested');
  await admin.query(`CREATE TABLE \`${name}\`.users(id varchar(36) primary key, username text, role text, is_active boolean)`);
  await admin.query(`INSERT INTO \`${name}\`.users VALUES ('staff','test-staff','admin',true),('company','test-company','company',true)`);
  await admin.query(`CREATE TABLE \`${name}\`.enterprise_licenses(id varchar(36) primary key, license_number text)`);
  await admin.query(`CREATE TABLE \`${name}\`.annex8_reports(id varchar(36) primary key, status text, licence_no text, period_month text)`);
  await admin.query(`CREATE TABLE \`${name}\`.annex8_report_instruments(id varchar(36) primary key, report_uuid varchar(36))`);
  await admin.query(`CREATE TABLE \`${name}\`.annex8_report_repairs(id varchar(36) primary key, report_uuid varchar(36))`);
  await admin.query(`INSERT INTO \`${name}\`.annex8_reports VALUES ('accepted','ACCEPTED','test','2026-09'),('draft','DRAFT','test','2026-10')`);
  Object.assign(process.env, { DB_DRIVER: 'mysql', MYSQL_URL: url.toString(), VERCEL: 'local-test-harness',
    NODE_ENV: 'test', ALLOW_LEGACY_API_HEADER_AUTH: 'true', ML_LIFECYCLE_ENABLED: 'true' });
  const { default: app } = await import('../server');
  server = http.createServer(app).listen(0, '127.0.0.1');
  await new Promise<void>(r => server!.once('listening', r));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/analytics`;
  const headers = (id: string, role: string) => ({ 'X-NMC-User-ID': id, 'X-NMC-Username': `test-${id}`, 'X-NMC-User-Role': role });
  for (const route of ['/retrain', '/rollback']) {
    assert.equal((await fetch(base + route, { method: 'POST' })).status, 401);
    assert.equal((await fetch(base + route, { method: 'POST', headers: headers('company', 'company') })).status, 403);
  }
  assert.equal((await fetch(base + '/model-health')).status, 401);
  assert.equal((await fetch(base + '/model-health', { headers: headers('company', 'company') })).status, 403);
  assert.equal((await fetch(base + '/retrain', { method: 'POST', headers: headers('staff', 'admin') })).status, 202);
  const health = await fetch(base + '/model-health', { headers: headers('staff', 'admin') });
  assert.equal(health.status, 200);
  const data: any = await health.json();
  assert.equal(data.status, 'cold_start'); assert.equal(data.pendingReports, 1);
  assert.equal(data.trainingReady, false);
  assert.match(data.readinessMessage, /Waiting for verified data/);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(base + '/rollback', { method: 'POST', headers: headers('staff', 'admin') })).status, 409);
  process.env.ML_LIFECYCLE_ENABLED = 'false';
  assert.equal((await fetch(base + '/retrain', { method: 'POST', headers: headers('staff', 'admin') })).status, 503);
  console.log('PASS: real loopback MySQL atomic CAS, exclusive lease, heartbeat, concurrent queue preservation and fenced release. Existing mlrs database untouched.');
  console.log('PASS: actual API anonymous/company denial, staff 202 queue, accepted-only pending telemetry, no-store, rollback safety and feature-disabled response.');
} catch (error) {
  failure = true; console.error(error);
} finally {
  if (server) await new Promise<void>(r => server!.close(() => r()));
  if (db) await db.end();
  await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
  await admin.end();
}
// server.ts owns a private adapter pool; all temporary schema is gone first.
process.exit(failure ? 1 : 0);
