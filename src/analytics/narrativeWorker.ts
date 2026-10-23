/**
 * Doing one job from the AI analyst's queue.
 *
 * Shared by the API endpoint (which the cron and the staff screen call) and
 * by the standalone worker script, so there is one definition of what
 * wording a report gets and how a failure is recorded.
 *
 * The budget here is generous, unlike the one in a request: nothing is
 * waiting on this, so the agent is given time to answer a provider having a
 * slow minute. The endpoint's own deadline still applies when the cron is
 * what called it, which is why this does ONE job and returns.
 */
import { collectAnalyticsSource } from './aggregate';
import { draftWithAiAnalyst, figuresFingerprint } from './aiAnalyst';
import { claimNext, completeJob, failJob } from './narrativeQueue';
import { resolveAiConfig } from './aiSettings';
import { buildAnalyticsData } from '../lib/analytics/buildAnalyticsData';

/** The period key as it is stored, back into the three parts. */
export function parsePeriodKey(type: string, key: string): { year: number; index: number } | null {
  const text = String(key || '').trim();
  if (type === 'MONTH') {
    // 01-12 only. "2026-13" is not a month, and reading it as one would
    // have the worker aggregate a period that does not exist.
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(text);
    return m ? { year: Number(m[1]), index: Number(m[2]) } : null;
  }
  if (type === 'QUARTER') {
    const m = /^(\d{4})-Q([1-4])$/.exec(text);
    return m ? { year: Number(m[1]), index: Number(m[2]) } : null;
  }
  if (type === 'SEMESTER') {
    const m = /^(\d{4})-S([1-2])$/.exec(text);
    return m ? { year: Number(m[1]), index: Number(m[2]) } : null;
  }
  if (type === 'YEAR') {
    const m = /^(\d{4})$/.exec(text);
    return m ? { year: Number(m[1]), index: 1 } : null;
  }
  return null;
}

export interface RunOutcome {
  /** What happened, for a log line and for the endpoint's reply. */
  outcome: 'idle' | 'worded' | 'failed' | 'lost';
  period?: string;
  model?: string | null;
  seconds?: number;
  detail?: string;
}

/**
 * Take one job and word it.
 *
 * Returns rather than throws for every expected failure: an overloaded
 * provider is the normal case, not an exception, and the cron calling this
 * should see a 200 with an explanation rather than a 500.
 */
export async function runOneNarrativeJob(db: any): Promise<RunOutcome> {
  const claimed = await claimNext(db);
  if (!claimed) return { outcome: 'idle' };

  const { job, token } = claimed;
  const period = `${job.period_type} ${job.period_key}`;
  const started = Date.now();
  const seconds = () => Math.round((Date.now() - started) / 100) / 10;

  const parts = parsePeriodKey(job.period_type, job.period_key);
  if (!parts) {
    // Not retryable: the row itself is wrong, so burn the attempts rather
    // than letting it circle the queue for ever.
    await failJob(db, job.id, null, `unreadable period key: ${job.period_key}`);
    return { outcome: 'failed', period, detail: 'unreadable period key' };
  }

  try {
    const source = await collectAnalyticsSource(db, job.period_type as any, parts.year, parts.index);
    const base = buildAnalyticsData(source, {});

    // Generous, because nothing is waiting: this is what moving the call
    // off the request path bought. A provider having a slow five minutes
    // now costs a late report rather than no report.
    // Which provider, from the settings screen if an administrator has set
    // one up, from the environment otherwise.
    const config = await resolveAiConfig(db);
    const result = await draftWithAiAnalyst(base, config, {
      budgetMs: Number(process.env.ANALYTICS_NARRATIVE_BUDGET_MS || 240000),
      timeoutMs: Number(process.env.ANALYTICS_NARRATIVE_TIMEOUT_MS || 120000),
    });
    if (!result.narrative) {
      await failJob(db, job.id, token, result.reason || 'the agent produced nothing usable');
      return { outcome: 'failed', period, seconds: seconds(), detail: result.reason };
    }

    // The fingerprint of the figures this wording was written against. The
    // reader re-checks every number anyway; this is so the screen can say
    // which figures it was written for.
    const stored = await completeJob(
      db, job.id, token, result.narrative, result.model, figuresFingerprint(base));

    // The lease lapsed while the provider was slow and another worker took
    // the job. Theirs is the answer; throwing this one away is correct, and
    // saying so is better than leaving it looking like a success.
    if (!stored) return { outcome: 'lost', period, seconds: seconds() };

    return { outcome: 'worded', period, model: result.model, seconds: seconds() };
  } catch (err: any) {
    const detail = String(err?.message || err);
    await failJob(db, job.id, token, detail);
    return { outcome: 'failed', period, seconds: seconds(), detail };
  }
}
