/**
 * The AI analyst's queue, against a real database.
 *
 *   npm run analytics:queue:check
 *
 * MySQL only, and it works on a disposable period (9999-01) that no real
 * report can use, cleaning up after itself. Running it against the
 * operational database is therefore safe, but it still refuses unless
 * DB_DRIVER=mysql so it can never reach Supabase.
 *
 * What it protects, in the order it would hurt to lose:
 *
 *  1. Stored wording is re-checked against today's figures before it is
 *     used. A queued narrative is written against a snapshot; if reports
 *     are accepted afterwards, "565 records" becomes false, and a false
 *     figure in a report to the Director General is the worst thing this
 *     feature could produce.
 *  2. One live job per period. Pressing the button twice must not pay for
 *     two calls, and two workers must not word one report in parallel.
 *  3. A lease, not a lock. A worker that dies must not strand a job in
 *     RUNNING, and a worker whose lease lapsed must not overwrite the
 *     result of the worker that took over.
 *  4. A failure retries, then gives up — rather than circling for ever.
 */
import 'dotenv/config';

import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createMysqlClient } from '../src/db/mysqlClient';
import { figuresFingerprint, narrativeStillGrounded } from '../src/analytics/aiAnalyst';
import {
  LEASE_MS, MAX_ATTEMPTS, claimNext, completeJob, failJob, latestJob,
  latestNarrative, liveJob, requestNarrative,
} from '../src/analytics/narrativeQueue';
import { parsePeriodKey } from '../src/analytics/narrativeWorker';
import type { AnalyticsData } from '../src/lib/analytics/contract';

if (process.env.DB_DRIVER !== 'mysql' || !process.env.MYSQL_URL) {
  console.error('Refusing to run: needs DB_DRIVER=mysql and MYSQL_URL.');
  console.error('It writes and deletes queue rows, and must never reach the production database.');
  process.exit(2);
}

const db: any = createMysqlClient(process.env.MYSQL_URL);
const TYPE = 'MONTH';
const KEY = '9999-01';            // a period no real report can occupy

let failures = 0;
const check = async (name: string, run: () => void | Promise<void>) => {
  try { await run(); console.log(`  OK   ${name}`); }
  catch (err: any) { failures++; console.error(`  FAIL ${name}\n       ${err?.message || err}`); }
};

const wipe = async () => {
  const { data } = await db.from('analytics_narrative_jobs').select('id').eq('period_key', KEY);
  for (const row of data || []) {
    await db.from('analytics_narrative_jobs').delete().eq('id', row.id);
  }
};

/* ------------------------------------------------------------------ *
 * 1. Stored wording is re-checked against today's figures
 * ------------------------------------------------------------------ */
console.log('\nStored wording is re-checked before it is used');

const sample = JSON.parse(
  fs.readFileSync('src/lib/analytics/__fixtures__/analytics-sample-data.json', 'utf8')) as AnalyticsData;

const grounded = {
  executive_summary: `វិភាគកំណត់ត្រា ${sample.records_analyzed} ពីអ្នកកាន់អាជ្ញាប័ណ្ណ ${sample.licensees_analyzed}។`,
  trend_commentary: 'និន្នាការមានស្ថេរភាព។',
  geo_commentary: 'សកម្មភាពភាគច្រើននៅរាជធានីភ្នំពេញ។',
  conclusion: 'សូមបន្តតាមដាន។',
};

await check('wording that matches the figures is accepted', () => {
  const result = narrativeStillGrounded(grounded, sample);
  assert.ok(result.narrative, result.problem);
  assert.equal(result.problem, '');
});

await check('wording quoting a figure the data no longer shows is refused', () => {
  // The real failure this guards: a narrative written last week says "601
  // records" and today's figures do not contain 601, because reports have
  // been accepted since. Checked both ways round, so the test cannot pass
  // by the figure being absent from both.
  const stale = { ...grounded, executive_summary: 'វិភាគកំណត់ត្រា ៦០១។' };
  const refused = narrativeStillGrounded(stale, sample);
  assert.equal(refused.narrative, null, 'a figure absent from the data must be refused');
  assert.match(refused.problem, /executive_summary/);

  const moved = { ...sample, records_analyzed: 601 } as unknown as AnalyticsData;
  const accepted = narrativeStillGrounded(stale, moved);
  assert.ok(accepted.narrative, 'the same wording is fine once 601 is a figure we computed');
});

await check('a missing section in stored wording is refused', () => {
  const { conclusion: _gone, ...partial } = grounded;
  const result = narrativeStillGrounded(partial, sample);
  assert.equal(result.narrative, null);
  assert.match(result.problem, /conclusion/);
});

await check('junk in the narrative column is refused rather than printed', () => {
  for (const junk of [null, 'a string', 42, ['an', 'array']]) {
    const result = narrativeStillGrounded(junk, sample);
    assert.equal(result.narrative, null, `accepted ${JSON.stringify(junk)}`);
  }
});

await check('the fingerprint is stable for the same figures and moves with them', () => {
  assert.equal(figuresFingerprint(sample), figuresFingerprint({ ...sample }));
  assert.notEqual(figuresFingerprint(sample),
    figuresFingerprint({ ...sample, records_analyzed: 601 } as unknown as AnalyticsData));
});

/* ------------------------------------------------------------------ *
 * 2. One live job per period
 * ------------------------------------------------------------------ */
console.log('\nOne live job per period');

await wipe();

await check('the first request queues a job', async () => {
  const { job, created } = await requestNarrative(db, TYPE, KEY, 'checker');
  assert.equal(created, true);
  assert.equal(job.status, 'PENDING');
  assert.equal(job.period_key, KEY);
});

await check('pressing again returns the same job, not a second one', async () => {
  const { job: first } = await requestNarrative(db, TYPE, KEY, 'checker');
  const { job: second, created } = await requestNarrative(db, TYPE, KEY, 'someone-else');
  assert.equal(created, false);
  assert.equal(second.id, first.id);
  const { data } = await db.from('analytics_narrative_jobs').select('id').eq('period_key', KEY);
  assert.equal((data || []).length, 1, 'only one row should exist for the period');
});

await check('the database refuses a second live job even without the read', async () => {
  // The unique index is the real guarantee; the read in requestNarrative is
  // only an optimisation, and a race must not be able to slip past it.
  const { error } = await db.from('analytics_narrative_jobs').insert({
    period_type: TYPE, period_key: KEY, status: 'PENDING', requested_by: 'racer',
  });
  assert.ok(error, 'a second PENDING row for the same period should be rejected');
});

/* ------------------------------------------------------------------ *
 * 3. Claiming, finishing, and the lease
 * ------------------------------------------------------------------ */
console.log('\nClaiming is a lease, not a lock');

let claimedId = '';
let claimedToken = '';

await check('a worker can claim the waiting job', async () => {
  const claimed = await claimNext(db);
  assert.ok(claimed, 'there should be a job to claim');
  assert.equal(claimed!.job.status, 'RUNNING');
  assert.equal(claimed!.job.attempts, 1, 'claiming counts as an attempt');
  claimedId = claimed!.job.id;
  claimedToken = claimed!.token;
});

await check('a second worker does not get the same job', async () => {
  const other = await claimNext(db);
  assert.equal(other, null, 'a job under a live lease must not be claimed again');
});

await check('a stale token cannot finish the job', async () => {
  const stored = await completeJob(db, claimedId, 'not-the-token', grounded, 'model-x', 'fp');
  assert.equal(stored, false, 'a worker whose lease lapsed must not overwrite the result');
  const { data } = await db.from('analytics_narrative_jobs').select('*').eq('id', claimedId).maybeSingle();
  assert.equal(data.status, 'RUNNING', 'the job should be untouched');
});

await check('the holder of the lease can finish it', async () => {
  const stored = await completeJob(db, claimedId, claimedToken, grounded, 'model-x', 'fp-1');
  assert.equal(stored, true);
  const { data } = await db.from('analytics_narrative_jobs').select('*').eq('id', claimedId).maybeSingle();
  assert.equal(data.status, 'DONE');
  assert.equal(data.agent_model, 'model-x');
  assert.ok(data.finished_at, 'a finished job records when');
  // The lease is what gates availability, and it is released. The token
  // stays as the record of whose answer this is — see wonWith.
  assert.equal(data.claimed_until, null, 'the lease is released');
  assert.equal(data.claim_token, claimedToken, 'the winning worker is still recorded');
});

await check('the finished wording survives the round trip through the database', async () => {
  // JSON columns under the MySQL driver have mangled Khmer before now, so
  // this reads it back rather than trusting the write.
  const stored = await latestNarrative(db, TYPE, KEY);
  assert.ok(stored?.narrative, 'the wording should be readable');
  const result = narrativeStillGrounded(stored!.narrative, sample);
  assert.ok(result.narrative, result.problem);
  assert.equal((result.narrative as any).executive_summary, grounded.executive_summary);
});

await check('a finished job is no longer live', async () => {
  assert.equal(await liveJob(db, TYPE, KEY), null);
  const latest = await latestJob(db, TYPE, KEY);
  assert.equal(latest?.status, 'DONE');
});

await check('and a new request may now be queued for the same period', async () => {
  const { created } = await requestNarrative(db, TYPE, KEY, 'checker');
  assert.equal(created, true, 'a DONE job must not block re-wording the period');
});

await check('an expired lease lets another worker take over', async () => {
  const claimed = await claimNext(db);
  assert.ok(claimed);
  // Simulate the worker dying: push the lease into the past.
  await db.from('analytics_narrative_jobs').update({
    claimed_until: new Date(Date.now() - LEASE_MS).toISOString(),
  }).eq('id', claimed!.job.id);

  const takeover = await claimNext(db);
  assert.ok(takeover, 'a job whose lease lapsed should be claimable');
  assert.equal(takeover!.job.id, claimed!.job.id);
  assert.notEqual(takeover!.token, claimed!.token, 'the new holder gets a new token');

  const stale = await completeJob(db, claimed!.job.id, claimed!.token, grounded, 'm', 'fp');
  assert.equal(stale, false, 'the worker that lost the lease must not finish it');
});

/* ------------------------------------------------------------------ *
 * 4. Failure retries, then gives up
 * ------------------------------------------------------------------ */
console.log('\nFailure retries, then gives up');

await wipe();

await check('a failure goes back to the queue while attempts remain', async () => {
  await requestNarrative(db, TYPE, KEY, 'checker');
  const claimed = await claimNext(db);
  await failJob(db, claimed!.job.id, claimed!.token, 'This model is currently experiencing high demand.');
  const { data } = await db.from('analytics_narrative_jobs').select('*').eq('id', claimed!.job.id).maybeSingle();
  assert.equal(data.status, 'PENDING', 'an overloaded provider is worth another go');
  assert.match(String(data.last_error), /high demand/);
  assert.equal(data.finished_at, null);
});

await check(`it gives up after ${MAX_ATTEMPTS} attempts, keeping the reason`, async () => {
  for (let i = 0; i < MAX_ATTEMPTS + 1; i++) {
    const claimed = await claimNext(db);
    if (!claimed) break;
    await failJob(db, claimed.job.id, claimed.token, `attempt ${i + 1} failed`);
  }
  const latest = await latestJob(db, TYPE, KEY);
  assert.equal(latest?.status, 'FAILED');
  assert.ok(latest?.last_error, 'the provider’s own words are what someone will need');
  assert.ok((latest?.attempts ?? 0) >= MAX_ATTEMPTS);
});

await check('a failed job is not used to word a report', async () => {
  assert.equal(await latestNarrative(db, TYPE, KEY), null);
});

await check('a job that gave up is no longer live, so nothing spins on it', async () => {
  // Asserted on this period rather than on claimNext, which is global: a
  // real pending job for another period would otherwise fail this check,
  // and claiming someone else's work to prove a point would disturb it.
  assert.equal(await liveJob(db, TYPE, KEY), null);
});

/* ------------------------------------------------------------------ *
 * 5. Period keys
 * ------------------------------------------------------------------ */
console.log('\nPeriod keys read back to the period they name');

await check('every shape round-trips', () => {
  assert.deepEqual(parsePeriodKey('MONTH', '2026-10'), { year: 2026, index: 10 });
  assert.deepEqual(parsePeriodKey('QUARTER', '2026-Q4'), { year: 2026, index: 4 });
  assert.deepEqual(parsePeriodKey('SEMESTER', '2026-S2'), { year: 2026, index: 2 });
  assert.deepEqual(parsePeriodKey('YEAR', '2026'), { year: 2026, index: 1 });
});

await check('a key that does not match its type is refused, not guessed', () => {
  for (const [type, key] of [
    ['MONTH', '2026-13'], ['MONTH', '2026-Q4'], ['QUARTER', '2026-Q5'],
    ['SEMESTER', '2026-S3'], ['YEAR', '2026-10'], ['MONTH', ''], ['NOPE', '2026-10'],
  ] as const) {
    assert.equal(parsePeriodKey(type, key), null, `${type} ${key} should not parse`);
  }
});

await wipe();
if (typeof db?.end === 'function') await db.end();

console.log(failures ? `\n${failures} check(s) FAILED\n` : '\nThe AI analyst queue holds.\n');
process.exitCode = failures ? 1 : 0;
