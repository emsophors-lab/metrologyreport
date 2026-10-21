import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { LifecycleStore, promotionAllowed, retrainReason, type Version } from '../src/ml/lifecycle';
import { runCycle, trainPython } from '../src/ml/worker';
import { anomalyScore, clusterIndex, FEATURE_KEYS, probability } from '../src/ml/portable';
import { collectDataset, trainingReadiness } from '../src/ml/dataset';

// Real isolated PostgreSQL CAS; no production database or Telegram connections.
const pg = new PGlite();
await pg.exec(`CREATE TABLE ml_lifecycle(id text primary key, revision bigint default 0, payload jsonb);
 INSERT INTO ml_lifecycle VALUES ('main',0,'{}');
 CREATE TABLE enterprise_licenses(id text primary key, license_number text, company_name text);
 CREATE TABLE annex8_reports(id text primary key, licence_no text, status text, period_month text);
 CREATE TABLE annex8_report_instruments(id text primary key, report_uuid text, op_code text, instrument_name text);
 CREATE TABLE annex8_report_repairs(id text primary key, report_uuid text, instrument_name text);
 CREATE TABLE test_reports(id text primary key, status text, x jsonb, y int);`);
function dbAdapter() {
  return { from(table: string) {
    const filters: [string, any][] = []; let patch: any, first = 0, last = 499;
    const query: any = {
      select: () => query, eq: (k: string, v: any) => { filters.push([k, v]); return query; },
      in: (k: string, v: any[]) => { filters.push([k, v]); return query; },
      update: (p: any) => { patch = p; return query; }, order: () => query,
      range: (a: number, b: number) => { first = a; last = b; return query; },
      single: async () => { const result = await query; return { ...result, data: result.data[0] }; },
      then: (ok: any, fail: any) => (async () => {
        const args: any[] = [];
        const where = filters.map(([k, v]) => { args.push(v); return Array.isArray(v) ? `${k}=ANY($${args.length}::text[])` : `${k}=$${args.length}`; }).join(' AND ');
        let sql = `SELECT * FROM ${table}${where ? ' WHERE ' + where : ''} ORDER BY id LIMIT ${last - first + 1} OFFSET ${first}`;
        if (patch) {
          const sets = Object.entries(patch).map(([k, v]) => { args.push(k === 'payload' ? JSON.stringify(v) : v); return `${k}=$${args.length}${k === 'payload' ? '::jsonb' : ''}`; });
          sql = `UPDATE ${table} SET ${sets.join(',')} WHERE ${where} RETURNING *`;
        }
        try { const result = await pg.query(sql, args); return { data: result.rows, error: null }; }
        catch (error) { return { data: null, error }; }
      })().then(ok, fail),
    }; return query;
  } };
}
const db = dbAdapter(), store = new LifecycleStore(db);
const directory = path.resolve('test-output/ml-lifecycle', String(Date.now()));
try {
  await pg.exec(`INSERT INTO enterprise_licenses VALUES ('l1','LIC-1','Test');
    INSERT INTO annex8_reports VALUES ('r1','LIC-1','ACCEPTED','2026-09'),('r2','LIC-1','DRAFT','2026-10');
    INSERT INTO annex8_report_instruments VALUES ('i1','r1','M','Scale'),('i2','r2','I','Draft instrument');
    INSERT INTO annex8_report_repairs VALUES ('i3','r1','Pressure gauge');`);
  const verified = await collectDataset(db);
  assert.equal(trainingReadiness(verified.samples).ready, false);
  assert.equal(trainingReadiness(Array.from({length:20}, () => ({y:0}))).ready, false);
  assert.equal(trainingReadiness(Array.from({length:20}, (_,i) => ({y:i%2}))).ready, true);
  await store.signal(true);
  assert.equal(await runCycle(store, collectDataset, db, async () => { throw new Error('Must not launch Python for insufficient data'); }, directory), 'waiting_for_data');
  assert.equal((await store.read()).state.manual, undefined);
  assert.equal((await store.read()).state.lastError, undefined);
  assert.equal((await store.read()).state.lastOutcome, 'insufficient_data');
  assert.deepEqual(verified.reportIds, ['r1']);
  assert.equal(verified.inferenceFeatures[0].serviceTypeCount, 2);
  assert.equal(verified.inferenceFeatures[0].instrumentTypeCount, 2);
  assert.deepEqual(verified.samples[0].x, FEATURE_KEYS.map(k => Math.fround(Number(verified.inferenceFeatures[0][k]))));
  const populate = async (start: number, end: number) => {
    for (let i = start; i < end; i++) {
      const y = i % 2;
      const x = FEATURE_KEYS.map((_, j) => j === 0 ? y * 20 + (i % 3) : (i % 3) * 30 + (i % 7) * 0.1);
      await pg.query('INSERT INTO test_reports VALUES ($1,$2,$3::jsonb,$4)', [`r${i}`, 'ACCEPTED', JSON.stringify(x), y]);
    }
  };
  const collect: any = async () => {
    const { rows }: any = await pg.query("SELECT * FROM test_reports WHERE status='ACCEPTED' ORDER BY id");
    return { samples: rows.map((r: any) => ({ id: r.id, reportIds: [r.id], x: r.x, y: r.y })),
      reportIds: rows.map((r: any) => r.id), fingerprint: rows.map((r: any) => r.id).join(',') };
  };
  await populate(0, 24);
  assert.equal(await runCycle(store, collect, db, trainPython, directory), 'not_due');
  await populate(24, 60);
  let started!: () => void, release!: () => void;
  const ready = new Promise<void>(r => { started = r; });
  const barrier = new Promise<void>(r => { release = r; });
  let trainingCalls = 0;
  const slowTrainer = async (input: any) => {
    trainingCalls++; started(); await barrier;
    const trained = await trainPython(input);
    assert.equal(trained.model.pca?.components.length, 2);
    assert.equal(trained.model.pca?.mean.length, FEATURE_KEYS.length);
    for (const probe of trained.probes || []) {
      assert.ok(Math.abs(probability(trained.model, probe.x) - probe.probability) < 1e-6);
      assert.ok(Math.abs(anomalyScore(trained.model, probe.x) - probe.anomaly) < 1e-6);
      assert.equal(clusterIndex(trained.model, probe.x), probe.cluster);
    }
    return trained;
  };
  const first = runCycle(store, collect, db, slowTrainer, directory);
  await ready;
  assert.equal(await runCycle(store, collect, db, trainPython, directory), 'locked');
  await store.signal(); // A signal during training must survive publication.
  release();
  assert.equal(await first, 'promoted');
  assert.equal(trainingCalls, 1);
  const champion = (await store.read()).state.active!;
  assert.ok(champion && champion.metrics.f1 >= 0.5);
  const metadata = JSON.parse(await fs.readFile(path.join(directory, 'active_metadata.json'), 'utf8'));
  assert.equal(metadata.id, champion.id);
  assert.equal(metadata.trainedReportCount, 60);
  assert.ok((await store.read()).state.requested);
  const sample = (await collect()).samples[0];
  assert.ok(Number.isFinite(probability(champion.model, sample.x)));
  assert.ok(Number.isFinite(anomalyScore(champion.model, sample.x)));
  assert.equal(await runCycle(store, collect, db, trainPython, directory), 'not_due');
  const worse: Version = { ...champion, metrics: { ...champion.metrics, f1: 0.5 } };
  assert.equal(promotionAllowed(worse, champion), false);
  assert.equal(promotionAllowed({ ...worse, trainedReportCount: 80 }, champion), true);
  assert.equal(promotionAllowed({ ...worse, metrics: { ...worse.metrics, silhouette: -0.1 }, trainedReportCount: 80 }, champion), false);
  assert.equal(promotionAllowed({ ...worse, metrics: { ...worse.metrics, f1: NaN } }, champion), false);
  await store.signal(true);
  assert.equal(await runCycle(store, collect, db, async () => ({ model: champion.model, metrics: worse.metrics }), directory), 'rejected');
  assert.equal((await store.read()).state.active!.id, champion.id);
  await populate(60, 85);
  assert.equal(await runCycle(store, collect, db, trainPython, directory), 'promoted');
  assert.equal((await store.read()).state.previous!.id, champion.id);
  const config = { threshold: 25, drift: 0.3, recentMinimum: 10, cooldownMs: 1000 };
  const state = (await store.read()).state;
  assert.equal(retrainReason(state, { reportIds: [...state.active!.reportIds, ...Array.from({length:10}, (_, i) => `new${i}`)], fingerprint: 'drift', anomalyRate: 0.5 }, config, Date.now() + 1001), 'drift');
  assert.equal(retrainReason(state, { reportIds: state.active!.reportIds.slice(1), fingerprint: 'withdrawn', anomalyRate: 0 }, config, Date.now() + 1001), 'changed_evidence');
  assert.equal(retrainReason(state, { reportIds: [...state.active!.reportIds, 'one-new'], fingerprint: 'one-new', anomalyRate: 0 }, config, Date.now() + 1001), null);
  await store.signal(true);
  assert.equal(await runCycle(store, collect, db, async () => {
    await populate(85, 86);
    return { model: state.active!.model, metrics: state.active!.metrics };
  }, directory), 'superseded');
  assert.equal((await store.read()).state.active!.id, state.active!.id);
  await store.signal(true);
  const manualBefore = (await store.read()).state.manual;
  await store.signal(true);
  assert.notEqual((await store.read()).state.manual, manualBefore);
  const expired = await store.claim(0, 1); assert.ok(expired);
  const newer = await store.claim(); assert.ok(newer);
  assert.equal(await store.finish(expired!, { active: worse }), false);
  await store.finish(newer!, {});
  await store.signal(true);
  assert.equal(await runCycle(store, collect, db, async () => { throw new Error('Simulated trainer crash'); }, directory), 'failed');
  assert.equal((await store.read()).state.lock, undefined);
  assert.ok((await store.read()).state.active);
  console.log('PASS: accepted-only dataset, batch threshold, real sklearn training, PostgreSQL CAS lock, concurrent signals, quality rejection/growth gates, drift, atomic metadata, previous champion backup, stale-worker fencing and crash recovery. No operational data or Telegram writes.');
} finally { await pg.close(); }
