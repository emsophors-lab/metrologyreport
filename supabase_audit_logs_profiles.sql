-- =====================================================================
--  MLRS — the two tables the base schema never delivered to production
--
--  PostgreSQL, for Supabase. Paste into the SQL editor and run.
--  Safe to re-run: every statement is IF NOT EXISTS or OR REPLACE, and
--  nothing here drops a table or deletes a row.
--
--  WHY THIS FILE EXISTS RATHER THAN supabase_schema.sql
--
--  supabase_schema.sql creates these alongside a `companies` table and
--  wires profiles.company_id to it. Production has no `companies` table
--  and never did: this system keeps its licensees in enterprise_licenses
--  and its accounts in public.users. Running the base schema to get two
--  tables would therefore either fail on the foreign key or introduce a
--  table nobody uses. This file creates only what is missing, shaped to
--  the database as it actually is.
--
--  WHAT WAS ACTUALLY BROKEN
--
--  audit_logs is the real defect. server.ts inserts into it in three
--  places, each inside a try/catch so that a failure never breaks the
--  action it accompanies. With no table, those inserts failed silently
--  and every one of those audit records was discarded. Nobody saw an
--  error; the trail simply was not there.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. profiles
--
--  Read in exactly one place (server.ts, role resolution) and written
--  nowhere. Roles are authoritative in public.users; this is the older
--  Supabase-Auth-keyed fallback that the resolver tries first.
--
--  Deliberately created WITHOUT the company_id foreign key from the base
--  schema: there is no companies table to point at. The column is kept
--  as a plain UUID so that any code reading it still finds it.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE,
  email       TEXT UNIQUE,
  role        TEXT CHECK (role IN ('superadmin', 'admin', 'company')),
  -- No FK: public.companies does not exist in this database.
  company_id  UUID,

  can_view    BOOLEAN NOT NULL DEFAULT TRUE,
  can_edit    BOOLEAN NOT NULL DEFAULT TRUE,
  can_save    BOOLEAN NOT NULL DEFAULT TRUE,
  can_delete  BOOLEAN NOT NULL DEFAULT TRUE,

  admin_can_add_company_user  BOOLEAN NOT NULL DEFAULT FALSE,
  admin_can_add_admin_user    BOOLEAN NOT NULL DEFAULT FALSE,
  admin_can_edit_users        BOOLEAN NOT NULL DEFAULT FALSE,
  admin_can_deactivate_users  BOOLEAN NOT NULL DEFAULT FALSE,
  admin_can_view_all_users    BOOLEAN NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE profiles IS
  'Legacy Supabase-Auth-keyed role fallback. Roles are authoritative in public.users; '
  'the resolver reads this first and falls through. Empty is correct and expected — '
  'do not start writing roles here without changing the resolver.';

-- ---------------------------------------------------------------------
--  2. audit_logs
--
--  Columns are exactly what server.ts inserts: actor_email, actor_role,
--  action_type, details, ip_address, target_user_id, created_at. Only
--  the first four are mandatory, because two of the three call sites
--  send only those.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_email       TEXT NOT NULL,
  actor_role        TEXT NOT NULL,
  -- e.g. USER_CREATED, REPORT_APPROVED, EXCEL_IMPORTED
  action_type       TEXT NOT NULL,
  details           TEXT NOT NULL,
  ip_address        TEXT,
  target_user_id    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reading an audit trail means "what happened, most recent first", and
-- "what did this person do" — so those are the two indexes.
CREATE INDEX IF NOT EXISTS idx_audit_logs_created
  ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
  ON audit_logs (actor_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON audit_logs (action_type, created_at DESC);

-- ---------------------------------------------------------------------
--  3. Access
--
--  The same posture as the analytics tables: row level security on, no
--  policies, and nothing granted to the browser-facing roles. The server
--  reaches these with the service role, which bypasses RLS. An audit log
--  readable with the public anon key would be a worse problem than the
--  one this file fixes.
-- ---------------------------------------------------------------------
ALTER TABLE profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON profiles   FROM anon, authenticated;
REVOKE ALL ON audit_logs FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON profiles   TO service_role;
-- No UPDATE and no DELETE: an audit record that can be edited is not one.
GRANT SELECT, INSERT ON audit_logs TO service_role;
