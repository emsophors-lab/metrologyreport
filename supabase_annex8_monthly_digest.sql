-- =====================================================================
--  ANNEX 8 — MONTHLY COMPLIANCE DIGEST
--
--  Run AFTER supabase_annex8_schema.sql.
--
--  Once a month the system totals up which licensed enterprises filed
--  their Annex 8 report with NMC and posts the result to the NMC
--  Telegram group:
--
--      POST /api/monthly-report-digest     (Vercel cron, day 8)
--
--  Day 8 is the morning after the ប្រការ២១ deadline on day 7, so the
--  first figure NMC sees is the final one for that month.
--
--  This table is both the audit trail and the guard against a repeat
--  post: a period that already has a 'Sent' row is not sent again
--  unless the endpoint is called with force=1.
-- =====================================================================

CREATE TABLE IF NOT EXISTS monthly_report_digest_logs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The month being reported on, YYYY-MM (not the month it was sent).
  period_month             TEXT NOT NULL,

  telegram_bot_setting_id  UUID,
  telegram_chat_id         TEXT,

  -- The headline numbers as they stood when the digest was sent, kept so
  -- a later query cannot silently rewrite history.
  licensee_count           INTEGER NOT NULL DEFAULT 0,
  submitted_count          INTEGER NOT NULL DEFAULT 0,
  on_time_count            INTEGER NOT NULL DEFAULT 0,
  late_count               INTEGER NOT NULL DEFAULT 0,
  missing_count            INTEGER NOT NULL DEFAULT 0,
  compliance_rate          INTEGER NOT NULL DEFAULT 0,

  -- A long roll call is split across several Telegram messages.
  message_count            INTEGER NOT NULL DEFAULT 1,
  message_text             TEXT,

  send_status              TEXT NOT NULL DEFAULT 'Sent'
                             CHECK (send_status IN ('Sent', 'Failed', 'Skipped')),
  error_message            TEXT,
  sent_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The duplicate guard reads this on every run.
CREATE INDEX IF NOT EXISTS idx_digest_logs_period
  ON monthly_report_digest_logs (period_month, send_status);
CREATE INDEX IF NOT EXISTS idx_digest_logs_sent_at
  ON monthly_report_digest_logs (sent_at DESC);

-- Written only by the server with the service-role key, which bypasses
-- RLS. No anon or authenticated policy is granted: the digest names which
-- enterprises are non-compliant, which is NMC's business and not a
-- licensee's.
ALTER TABLE monthly_report_digest_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE monthly_report_digest_logs IS
  'One row per monthly Telegram compliance digest. A Sent row blocks a repeat post for that period.';
COMMENT ON COLUMN monthly_report_digest_logs.period_month IS
  'The month reported on (YYYY-MM), not the month the message was sent.';
