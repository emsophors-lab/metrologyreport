/**
 * The AI analyst's work queue.
 *
 * The agent takes 25-30 seconds when the provider is healthy and minutes
 * when it is not. Inside an HTTP request that is two failures waiting to
 * happen: the officer watches a spinner, and the serverless function is
 * killed at its own deadline, so a report becomes a 504. Here the request
 * only records that the wording was asked for; a worker does the work and
 * stores the result; the report picks it up next time it is built.
 *
 * Everything goes through the shared query-builder client rather than raw
 * SQL, so it runs unchanged on Supabase and on the MySQL driver.
 *
 * A LEASE, NOT A LOCK
 *
 * A claimed job carries a token and an expiry. A worker that is killed
 * mid-call holds the job only until the lease lapses, after which another
 * may take it — so a crash costs one wasted call, not a job stuck in
 * RUNNING for ever. Every write that finishes a job also checks the token,
 * so a worker whose lease expired while it was waiting on the provider
 * cannot overwrite the result of the worker that took over.
 */
import { randomUUID } from 'node:crypto';

export type JobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';

export interface NarrativeJob {
  id: string;
  period_type: string;
  period_key: string;
  status: JobStatus;
  narrative: unknown;
  agent_model: string | null;
  figures_fingerprint: string | null;
  attempts: number;
  last_error: string | null;
  requested_by: string | null;
  requested_at: string | null;
  finished_at: string | null;
}

/** How long a worker holds a claimed job before another may take it. */
export const LEASE_MS = 5 * 60 * 1000;
/** Attempts before a job is left FAILED for someone to look at. */
export const MAX_ATTEMPTS = 3;

const TABLE = 'analytics_narrative_jobs';
const now = () => new Date().toISOString();

function raise(what: string, error: any): never {
  throw new Error(`${what}: ${error?.message || error}`);
}

/**
 * Whether a guarded update was ours, by reading the row back.
 *
 * Postgres answers this with UPDATE ... RETURNING, and the MySQL adapter
 * imitates it by re-reading through the same filter. That works for
 * server.ts's updates, which filter by id — but every transition here
 * filters on a column it then changes (status, or the claim token), so the
 * re-read matches nothing and a successful write looks like a failure.
 *
 * So ownership is settled by the token instead. It is unique to one
 * attempt, and the database serialises the guarded updates, so exactly one
 * worker's token can be in the row. Whoever finds their own token there won;
 * everyone else lost and must not act as though they had written anything.
 *
 * This is also why a finished job KEEPS its token rather than clearing it:
 * the token is the record of who did the work, and clearing it would throw
 * away the only evidence of which worker's write landed.
 */
async function wonWith(db: any, id: string, token: string, expected: JobStatus): Promise<boolean> {
  const { data, error } = await db.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) raise('read back job', error);
  return !!data && data.claim_token === token && data.status === expected;
}

/* ------------------------------------------------------------------ *
 * Asking for wording
 * ------------------------------------------------------------------ */

/**
 * Queue the wording of one period, or return the job already queued for it.
 *
 * Idempotent on purpose: an officer who presses the button twice, or two
 * officers looking at the same month, should not produce two calls to the
 * provider for one report. The unique index enforces this in the database
 * as well, so a race between two requests cannot slip past the read below.
 */
export async function requestNarrative(
  db: any, periodType: string, periodKey: string, requestedBy: string,
): Promise<{ job: NarrativeJob; created: boolean }> {
  const existing = await db.from(TABLE).select('*')
    .eq('period_type', periodType).eq('period_key', periodKey)
    .in('status', ['PENDING', 'RUNNING']).maybeSingle();
  if (existing.error) raise('read queue', existing.error);
  if (existing.data) return { job: existing.data as NarrativeJob, created: false };

  const insert = await db.from(TABLE).insert({
    period_type: periodType, period_key: periodKey, status: 'PENDING',
    requested_by: requestedBy, requested_at: now(), attempts: 0,
  }).select('*').single();

  if (insert.error) {
    // Lost the race against another request. The job it created is the
    // right answer, so return that rather than failing the officer's press.
    const again = await db.from(TABLE).select('*')
      .eq('period_type', periodType).eq('period_key', periodKey)
      .in('status', ['PENDING', 'RUNNING']).maybeSingle();
    if (again.data) return { job: again.data as NarrativeJob, created: false };
    raise('queue narrative', insert.error);
  }
  return { job: insert.data as NarrativeJob, created: true };
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/** The live job for a period, if the wording is still being worked on. */
export async function liveJob(db: any, periodType: string, periodKey: string) {
  const { data, error } = await db.from(TABLE).select('*')
    .eq('period_type', periodType).eq('period_key', periodKey)
    .in('status', ['PENDING', 'RUNNING']).maybeSingle();
  if (error) raise('read live job', error);
  return (data || null) as NarrativeJob | null;
}

/**
 * The newest wording produced for a period.
 *
 * DONE only. A FAILED job is a thing to report on the screen, never
 * something to word a report with.
 */
export async function latestNarrative(db: any, periodType: string, periodKey: string) {
  const { data, error } = await db.from(TABLE).select('*')
    .eq('period_type', periodType).eq('period_key', periodKey).eq('status', 'DONE')
    .order('finished_at', { ascending: false }).limit(1);
  if (error) raise('read narrative', error);
  return ((data || [])[0] || null) as NarrativeJob | null;
}

/** The most recent job of any status, for telling the officer where things stand. */
export async function latestJob(db: any, periodType: string, periodKey: string) {
  const { data, error } = await db.from(TABLE).select('*')
    .eq('period_type', periodType).eq('period_key', periodKey)
    .order('requested_at', { ascending: false }).limit(1);
  if (error) raise('read latest job', error);
  return ((data || [])[0] || null) as NarrativeJob | null;
}

/* ------------------------------------------------------------------ *
 * Working
 * ------------------------------------------------------------------ */

/**
 * Take the oldest job that is waiting, or one whose lease has lapsed.
 *
 * The claim is a conditional update: the row is only taken if it still
 * holds the status this worker read. Two workers racing for the same job
 * means one of them updates nothing and moves on, which is what the token
 * returned here lets the caller detect.
 */
export async function claimNext(db: any): Promise<{ job: NarrativeJob; token: string } | null> {
  const { data, error } = await db.from(TABLE).select('*')
    .in('status', ['PENDING', 'RUNNING'])
    .order('requested_at', { ascending: true }).limit(10);
  if (error) raise('read queue', error);

  const stamp = Date.now();
  for (const row of (data || []) as NarrativeJob[]) {
    const claimedUntil = Date.parse(String((row as any).claimed_until || ''));
    const available = row.status === 'PENDING'
      || !Number.isFinite(claimedUntil) || claimedUntil <= stamp;
    if (!available) continue;
    if ((row.attempts ?? 0) >= MAX_ATTEMPTS) {
      await failJob(db, row.id, null, `gave up after ${MAX_ATTEMPTS} attempts`);
      continue;
    }

    const token = randomUUID();
    const claim = await db.from(TABLE).update({
      status: 'RUNNING', claim_token: token,
      claimed_until: new Date(stamp + LEASE_MS).toISOString(),
      attempts: (row.attempts ?? 0) + 1, updated_at: now(),
    }).eq('id', row.id).eq('status', row.status);
    if (claim.error) raise('claim job', claim.error);

    // The guard is in the SQL; who won is settled by the token. Someone
    // else claiming it between the read and the update means their token is
    // in the row, so move on rather than fighting over this one.
    if (await wonWith(db, row.id, token, 'RUNNING')) {
      const { data: fresh } = await db.from(TABLE).select('*').eq('id', row.id).maybeSingle();
      return { job: fresh as NarrativeJob, token };
    }
  }
  return null;
}

/** Store the wording. Refuses if the lease was lost while the agent worked. */
export async function completeJob(
  db: any, id: string, token: string,
  narrative: unknown, agentModel: string | null, fingerprint: string,
): Promise<boolean> {
  const { error } = await db.from(TABLE).update({
    status: 'DONE', narrative, agent_model: agentModel,
    figures_fingerprint: fingerprint, last_error: null,
    // The token stays: it records which worker's answer this is. See wonWith.
    claimed_until: null,
    finished_at: now(), updated_at: now(),
  }).eq('id', id).eq('claim_token', token);
  if (error) raise('complete job', error);
  return wonWith(db, id, token, 'DONE');
}

/**
 * Record a failure.
 *
 * Back to PENDING while attempts remain, because the commonest failures —
 * an overloaded model, a dropped connection — succeed on the next run. Only
 * a job that has used its attempts is left FAILED, where the screen can
 * show the provider's own words to whoever has to decide what to do.
 */
export async function failJob(
  db: any, id: string, token: string | null, message: string,
): Promise<boolean> {
  const current = await db.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (current.error) raise('read job', current.error);
  const attempts = (current.data?.attempts ?? MAX_ATTEMPTS) as number;
  const exhausted = attempts >= MAX_ATTEMPTS;

  const status: JobStatus = exhausted ? 'FAILED' : 'PENDING';
  let query = db.from(TABLE).update({
    status,
    last_error: message.slice(0, 500),
    // Kept for the same reason as on success: it says whose attempt this
    // was. A PENDING row's token is ignored when the job is claimed again.
    claimed_until: null,
    finished_at: exhausted ? now() : null, updated_at: now(),
  }).eq('id', id);
  // A worker whose lease lapsed must not overwrite the worker that took
  // over. Where there is no token (the giving-up path above) there is
  // nothing to check.
  if (token) query = query.eq('claim_token', token);

  const { error } = await query;
  if (error) raise('fail job', error);
  if (!token) return true;
  return wonWith(db, id, token, status);
}
