import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from 'dotenv';

// Load only the private production profile, never the application's MySQL .env.
const directory = path.resolve(process.env.LOCALAPPDATA || '', 'MLRS/production-ml');
const envFile = path.join(directory, 'worker.env');
if (!process.env.LOCALAPPDATA || !fs.existsSync(envFile)) throw new Error('Private production worker profile is not configured.');
const loaded = config({ path: envFile, override: true, quiet: true });
if (loaded.error) throw new Error('Cannot load the private production worker profile.');
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const helper = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const { stdout } = await promisify(execFile)(helper, ['-NoProfile', '-NonInteractive', '-Command',
    '$ErrorActionPreference="Stop"; $s=Import-Clixml -LiteralPath $env:MLRS_CREDENTIAL_FILE; [Console]::Out.Write(([Net.NetworkCredential]::new("",$s)).Password)'], {
    windowsHide: true, timeout: 15000, maxBuffer: 10000,
    env: { ...process.env, MLRS_CREDENTIAL_FILE: path.join(directory, 'credential.xml') },
  });
  process.env.SUPABASE_SERVICE_ROLE_KEY = stdout.trim();
}
if (process.argv.includes('--scheduled')) {
  const file = path.join(directory, 'worker.log');
  const log = (message: string) => {
    if (fs.existsSync(file) && fs.statSync(file).size > 2 * 1024 * 1024) {
      fs.copyFileSync(file, file + '.previous'); fs.truncateSync(file, 0);
    }
    fs.appendFileSync(file, `${new Date().toISOString()} ${message}\n`, { mode: 0o600 });
  };
  console.log = (...args) => log(args.join(' '));
  console.error = () => log('Worker error; inspect database health.');
  process.on('uncaughtException', () => { log('Worker stopped unexpectedly.'); process.exit(1); });
}
if (process.env.DB_DRIVER !== 'supabase' || process.env.ML_LIFECYCLE_ENABLED !== 'true') {
  throw new Error('Production profile must explicitly enable the Supabase worker.');
}
const url = new URL(process.env.VITE_SUPABASE_URL || '');
if (url.protocol !== 'https:' || url.hostname !== 'krbpahxhhpzinpmyslfh.supabase.co') {
  throw new Error('Production worker target does not match the authorized MLRS project.');
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Production worker server credential is missing.');
// Prevent a caller or a development .env from redirecting private artifacts.
process.env.ML_MODEL_DIR = path.join(directory, 'models');
delete process.env.MYSQL_URL;
if (process.argv.includes('--status')) {
  const { createClient } = await import('@supabase/supabase-js');
  const { LifecycleStore } = await import('../src/ml/lifecycle');
  const { collectDataset } = await import('../src/ml/dataset');
  const db = createClient(url.toString(), process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { state } = await new LifecycleStore(db).read();
  const dataset = await collectDataset(db);
  const known = new Set(state.active?.reportIds || []);
  console.log(JSON.stringify({ project: url.hostname, workerOnline: !!state.workerSeenAt && Date.now() - state.workerSeenAt < 180000,
    acceptedReports: dataset.reportIds.length, enterprises: dataset.samples.length,
    pendingReports: dataset.reportIds.filter(id => !known.has(id)).length,
    activeVersion: state.active?.id || null, lastOutcome: state.lastOutcome || null, lastError: state.lastError || null }, null, 2));
} else {
  const { workerMain } = await import('../src/ml/worker');
  await workerMain();
}
