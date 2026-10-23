-- =====================================================================
--  MLRS — the AI analyst's work queue
--
--  PostgreSQL, for Supabase. Paste into the SQL editor and run.
--  Safe to re-run: every statement is IF NOT EXISTS, and nothing here
--  drops a table or deletes a row.
--
--  WHY A QUEUE
--
--  The agent takes 25-30 seconds to word a report when the provider is
--  healthy, and longer when it is not. Inside an HTTP request that is
--  two problems at once: the officer stares at a spinner, and the
--  serverless function is killed at its own deadline, turning a report
--  into a 504. So the request records that the wording was asked for,
--  and a worker does it.
--
--  WHY THE FINGERPRINT MATTERS
--
--  A queued narrative is written against the figures as they stood when
--  the worker ran. If reports are accepted afterwards, the figures move
--  and a sentence saying "565 records" becomes false. The fingerprint
--  records which figures it was written for, so the screen can say so —
--  and the reader re-checks every number in the stored text against the
--  current figures before using it, which is the guarantee that actually
--  protects the report.
-- =====================================================================

CREATE TABLE IF NOT EXISTS analytics_narrative_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  period_type     TEXT NOT NULL CHECK (period_type IN ('MONTH', 'QUARTER', 'SEMESTER', 'YEAR')),
  -- 2026-10 | 2026-Q4 | 2026-S2 | 2026
  period_key      TEXT NOT NULL,

  status          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'FAILED')),

  -- The four Khmer sections the agent wrote. Nothing else from its reply
  -- is stored, because nothing else from its reply is used.
  narrative       JSONB,
  -- Which model answered. The report names it, so a substitution between
  -- models in the configured list is visible rather than silent.
  agent_model     TEXT,
  -- SHA-256 of the figures the narrative was written against.
  figures_fingerprint TEXT,

  attempts        INT  NOT NULL DEFAULT 0,
  last_error      TEXT,

  -- A lease, not a lock: a worker that dies holds the job only until
  -- claimed_until passes, after which another may take it. The same
  -- pattern as the ML lifecycle's claim.
  claim_token     TEXT,
  claimed_until   TIMESTAMPTZ,

  requested_by    TEXT,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One live job per period. Pressing the button twice should not queue the
-- same work twice, and two workers should not word one report in parallel.
-- Finished rows are exempt, so the history of what was asked for survives.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_analytics_narrative_live
  ON analytics_narrative_jobs (period_type, period_key)
  WHERE status IN ('PENDING', 'RUNNING');

CREATE INDEX IF NOT EXISTS idx_analytics_narrative_period
  ON analytics_narrative_jobs (period_type, period_key, status);
-- The worker's own query: the oldest thing still waiting.
CREATE INDEX IF NOT EXISTS idx_analytics_narrative_queue
  ON analytics_narrative_jobs (status, requested_at);
-- The reader's query: the newest finished wording for a period.
CREATE INDEX IF NOT EXISTS idx_analytics_narrative_finished
  ON analytics_narrative_jobs (finished_at DESC);
