/**
 * The AI analyst's worker.
 *
 *   npm run analytics:narrative-worker            keep working the queue
 *   npm run analytics:narrative-worker -- --once  do one job and stop
 *
 * Use this where there is a machine to run it on — the NMC desktop that
 * already runs the ML worker is the obvious place. In production on Vercel
 * the same work is done by the cron calling
 * POST /api/analytics/narrative/run, which does one job per call; either
 * way the queue is drained by the same code.
 *
 * Stops cleanly on Ctrl-C: a job already claimed is left to finish, and its
 * lease means that if this process is killed outright another worker picks
 * the job up rather than it sitting in RUNNING for ever.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

import { createMysqlClient } from '../src/db/mysqlClient';
import { aiAnalystEnabled } from '../src/analytics/aiAnalyst';
import { runOneNarrativeJob } from '../src/analytics/narrativeWorker';

const IDLE_MS = Number(process.env.ANALYTICS_NARRATIVE_POLL_MS || 15000);

if (!aiAnalystEnabled()) {
  console.error('The AI analyst is not configured. Set ANALYTICS_AI_ENABLED=true and GEMINI_API_KEY.');
  console.error('Reports are worded by the deterministic drafter without it; this worker has nothing to do.');
  process.exit(2);
}

const db: any = process.env.DB_DRIVER === 'mysql'
  ? createMysqlClient(process.env.MYSQL_URL!)
  : createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } });

const once = process.argv.includes('--once');
let stop = false;
process.on('SIGINT', () => { stop = true; });
process.on('SIGTERM', () => { stop = true; });

console.log(once ? 'Working one job.' : `Working the queue; polling every ${IDLE_MS}ms. Ctrl-C to stop.`);

try {
  do {
    const result = await runOneNarrativeJob(db);
    if (result.outcome === 'worded') {
      console.log(`worded ${result.period} in ${result.seconds}s by ${result.model}`);
    } else if (result.outcome === 'failed') {
      console.log(`failed ${result.period} after ${result.seconds ?? 0}s: ${result.detail}`);
    } else if (result.outcome === 'lost') {
      console.log(`lost ${result.period}: the lease lapsed and another worker finished it`);
    }
    if (once) break;
    // Only sleep when there was nothing to do. A busy queue is drained
    // without pausing between jobs.
    if (result.outcome === 'idle') {
      for (let i = 0; i < Math.ceil(IDLE_MS / 500) && !stop; i++) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  } while (!stop);
} finally {
  if (typeof db?.end === 'function') await db.end();
}
console.log('Stopped.');
