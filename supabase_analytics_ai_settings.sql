-- =====================================================================
--  MLRS — where the AI analyst's provider is configured
--
--  PostgreSQL, for Supabase. Paste into the SQL editor and run.
--  Safe to re-run.
--
--  One row, id = 'main'. Which provider the Centre uses (Gemini, Claude or
--  ChatGPT), with which key and models, set on the settings screen by a
--  superadmin rather than by redeploying with new environment variables.
--
--  THE KEY
--
--  Stored in api_key_encrypted and NEVER returned to a browser: the API
--  replaces it with PROTECTED_SERVER_SIDE, and a save that sends that
--  placeholder back means "keep the key you already have". This is the same
--  handling as telegram_bot_settings.bot_token_encrypted.
--
--  Be aware of what that does and does not give you: the column is not
--  encrypted at rest by this application. It is as safe as the database and
--  its backups, no safer. Anyone who can read the table can read the key,
--  so treat a database dump as containing a live API credential.
-- =====================================================================

CREATE TABLE IF NOT EXISTS analytics_ai_settings (
  id                  TEXT PRIMARY KEY DEFAULT 'main',

  -- gemini | claude | openai
  provider            TEXT NOT NULL DEFAULT 'gemini'
                        CHECK (provider IN ('gemini', 'claude', 'openai')),
  -- Comma-separated, tried in order. A provider's models go through spells
  -- of high demand, and a report should not lose its wording to a busy
  -- five minutes.
  models              TEXT NOT NULL DEFAULT '',
  api_key_encrypted   TEXT,

  -- Off until someone turns it on. Without it the report is worded by the
  -- deterministic drafter, which needs no external service at all.
  is_active           BOOLEAN NOT NULL DEFAULT FALSE,

  -- The last connection test, so the screen can show whether the key works
  -- without anyone having to queue a report to find out.
  last_test_status    TEXT,
  last_test_message   TEXT,
  last_tested_at      TIMESTAMPTZ,

  updated_by          TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO analytics_ai_settings (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;
