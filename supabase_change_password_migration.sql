-- =========================================================================
-- NMC Metrology Report System - Change My Password support
-- Applies safely to the current custom users table.
-- =========================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_password_change_by TEXT;

CREATE INDEX IF NOT EXISTS idx_users_password_updated_at
  ON public.users(password_updated_at);
