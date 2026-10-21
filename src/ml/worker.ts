import 'dotenv/config';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createMysqlClient } from '../db/mysqlClient';
import { collectDataset, trainingReadiness } from './dataset';
import { LifecycleStore, promotionAllowed, retrainReason, type Version } from './lifecycle';
import { anomalyScore, FEATURE_KEYS } from './portable';

export function config() {
  const number = (key: string, fallback: number, min: number, max: number) => {
    const n = Number(process.env[key] ?? fallback);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Invalid ${key}`);
    return n;
  };
  return { threshold: number('ML_RETRAIN_REPORT_THRESHOLD', 25, 1, 100000),
    drift: number('ML_ANOMALY_SPIKE_RATIO', 0.3, 0, 1), recentMinimum: number('ML_DRIFT_MIN_REPORTS', 10, 2, 100000),
    cooldownMs: number('ML_RETRAIN_COOLDOWN_MS', 21600000, 1000, 604800000) };
}
export async function atomicMetadata(directory: string, version: Version) {
  await mkdir(directory, { recursive: true });
  const temp = path.join(directory, `metadata-${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(version), { mode: 0o600 });
  await rename(temp, path.join(directory, 'active_metadata.json'));
}
export function trainPython(input: any): Promise<{ model: Version['model']; metrics: Version['metrics']; probes?: any[] }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.ML_PYTHON || 'python', ['ml/train.py'], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, HOME: process.env.HOME,
        OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1' },
    });
    let output = '', error = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Training exceeded ten minutes.')); }, 600000);
    child.stdout.on('data', b => { output += b; if (output.length > 20_000_000) child.kill(); });
    child.stderr.on('data', b => { error = (error + b).slice(-3000); });
    child.on('error', e => { clearTimeout(timeout); reject(e); });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0) return reject(new Error(error || 'Training process failed.'));
      try { resolve(JSON.parse(output)); } catch { reject(new Error('Invalid training output.')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(input));
  });
}
export async function runCycle(store: LifecycleStore, collect: typeof collectDataset, db: any,
  trainer = trainPython, directory = path.resolve(process.env.ML_MODEL_DIR || 'var/ml-models')) {
  const token = await store.claim(); if (!token) return 'locked';
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let startedManual: string | undefined;
  try {
    heartbeat = setInterval(() => { void store.heartbeat(token).catch(() => false); }, 30000);
    const { state } = await store.read();
    startedManual = state.manual;
    if (state.active) await atomicMetadata(directory, state.active);
    const dataset = await collect(db);
    if (!trainingReadiness(dataset.samples).ready) {
      await store.mutate(s => s.lock?.token !== token || s.lock.until <= Date.now() ? null : {
        ...s, lock: undefined, workerSeenAt: Date.now(), lastOutcome: 'insufficient_data', lastError: undefined,
        manual: s.manual === state.manual ? undefined : s.manual,
        requested: s.requested === state.requested ? undefined : s.requested,
      });
      return 'waiting_for_data';
    }
    const known = new Set(state.active?.reportIds || []);
    const recent = dataset.samples.filter(r => r.reportIds.some(id => !known.has(id)));
    const recentCount = recent.reduce((n, r) => n + r.reportIds.filter(id => !known.has(id)).length, 0);
    const anomalyRate = state.active && recentCount ? recent.reduce((n, r) => n + (
      anomalyScore(state.active!.model, r.x) > state.active!.model.anomalyThreshold
        ? r.reportIds.filter(id => !known.has(id)).length : 0), 0) / recentCount : 0;
    const reason = retrainReason(state, { ...dataset, anomalyRate }, config());
    if (!reason) { await store.finish(token, { workerSeenAt: Date.now() }); return 'not_due'; }
    const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
    const trained = await trainer({ samples: dataset.samples, features: FEATURE_KEYS, directory: path.join(directory, id) });
    const latest = await collect(db);
    if (latest.fingerprint !== dataset.fingerprint) {
      await store.mutate(s => s.lock?.token !== token || s.lock.until <= Date.now() ? null : {
        ...s, lock: undefined, manual: s.manual || randomUUID(), lastOutcome: 'superseded', workerSeenAt: Date.now(),
      });
      return 'superseded';
    }
    if (state.active && dataset.samples.length) {
      const difference = dataset.samples.reduce((sum, r) => sum + Math.abs(
        anomalyScore(state.active!.model, r.x) - anomalyScore(trained.model, r.x)), 0) / dataset.samples.length;
      trained.metrics.anomalyStability = Math.min(trained.metrics.anomalyStability, 1 - difference);
    }
    const version: Version = { model: trained.model, metrics: trained.metrics, id, trainedAt: new Date().toISOString(),
      trainedReportCount: dataset.reportIds.length, reportIds: dataset.reportIds, fingerprint: dataset.fingerprint };
    const promote = promotionAllowed(version, state.active);
    // A token is a fencing guard: an expired/reclaimed worker can never publish.
    const saved = await store.mutate(s => s.lock?.token !== token || s.lock.until <= Date.now() ? null : {
      ...s, lastAttemptAt: Date.now(), lastFingerprint: dataset.fingerprint,
      manual: s.manual === state.manual ? undefined : s.manual,
      requested: s.requested === state.requested ? undefined : s.requested,
      lastOutcome: promote ? 'promoted' : 'rejected_quality', lastError: undefined, workerSeenAt: Date.now(),
      ...(promote ? { previous: s.active, active: version } : {}),
    });
    if (!saved) return 'lease_lost';
    await mkdir(path.join(directory, id), { recursive: true });
    await writeFile(path.join(directory, id, 'metadata.json'), JSON.stringify({ ...version, reason, promoted: promote }), { mode: 0o600 });
    if (promote) await atomicMetadata(directory, version);
    await store.finish(token, {});
    return promote ? 'promoted' : 'rejected';
  } catch (error: any) {
    await store.mutate(s => s.lock?.token !== token || s.lock.until <= Date.now() ? null : {
      ...s, lock: undefined, manual: s.manual === startedManual ? undefined : s.manual,
      lastError: String(error.message || 'Training failed').slice(0, 500),
      lastAttemptAt: Date.now(), workerSeenAt: Date.now(),
    });
    return 'failed';
  } finally { if (heartbeat) clearInterval(heartbeat); }
}

export async function workerMain() {
  if (process.env.ML_LIFECYCLE_ENABLED !== 'true') throw new Error('Set ML_LIFECYCLE_ENABLED=true after applying migration.');
  const db = process.env.DB_DRIVER === 'mysql' ? createMysqlClient(process.env.MYSQL_URL!) :
    createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const store = new LifecycleStore(db);
  let stop = false;
  process.on('SIGTERM', () => { stop = true; }); process.on('SIGINT', () => { stop = true; });
  try {
    do {
      console.log('ML cycle:', await runCycle(store, collectDataset, db));
      if (process.argv.includes('--once')) break;
      for (let i = 0; i < 30 && !stop; i++) await new Promise(r => setTimeout(r, 1000));
    } while (!stop);
  } finally { if ('end' in db) await (db as any).end(); }
}
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/src/ml/worker.ts')) workerMain().catch(e => { console.error(e.message); process.exitCode = 1; });
