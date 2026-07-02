-- Telegram Bot Settings schema compatibility migration
-- Safe to run multiple times in Supabase SQL Editor.

ALTER TABLE public.telegram_bot_settings ADD COLUMN IF NOT EXISTS default_group_chat_id TEXT;
ALTER TABLE public.telegram_bot_settings ADD COLUMN IF NOT EXISTS bot_display_name TEXT;
ALTER TABLE public.telegram_bot_settings ADD COLUMN IF NOT EXISTS connection_status TEXT DEFAULT 'not_verified';
ALTER TABLE public.telegram_bot_settings ADD COLUMN IF NOT EXISTS last_test_message TEXT;
ALTER TABLE public.telegram_bot_settings ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ;
ALTER TABLE public.telegram_bot_settings ADD COLUMN IF NOT EXISTS webhook_status TEXT DEFAULT 'not_configured';
ALTER TABLE public.telegram_bot_settings ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE public.telegram_bot_settings ADD COLUMN IF NOT EXISTS last_webhook_setup_at TIMESTAMPTZ;
ALTER TABLE public.telegram_bot_settings ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;
ALTER TABLE public.telegram_bot_settings ADD COLUMN IF NOT EXISTS bot_purpose TEXT DEFAULT 'report_group';
ALTER TABLE public.telegram_bot_settings ADD COLUMN IF NOT EXISTS bot_description TEXT;

ALTER TABLE public.telegram_bot_settings ALTER COLUMN bot_purpose SET DEFAULT 'report_group';
ALTER TABLE public.telegram_bot_settings ALTER COLUMN connection_status SET DEFAULT 'not_verified';
ALTER TABLE public.telegram_bot_settings ALTER COLUMN webhook_status SET DEFAULT 'not_configured';
ALTER TABLE public.telegram_bot_settings ALTER COLUMN is_active SET DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.telegram_bot_settings'::regclass
      AND conname = 'telegram_bot_settings_bot_purpose_check'
  ) THEN
    ALTER TABLE public.telegram_bot_settings DROP CONSTRAINT telegram_bot_settings_bot_purpose_check;
  END IF;
END $$;

UPDATE public.telegram_bot_settings
SET
  bot_purpose = CASE
    WHEN bot_purpose = 'report_notification' THEN 'report_group'
    WHEN bot_purpose IN ('license_reminder', 'report_group', 'both') THEN bot_purpose
    ELSE 'report_group'
  END,
  default_group_chat_id = COALESCE(NULLIF(btrim(default_group_chat_id), ''), NULLIF(btrim(default_chat_id), '')),
  bot_display_name = COALESCE(NULLIF(btrim(bot_display_name), ''), NULLIF(btrim(bot_name), '')),
  bot_description = COALESCE(NULLIF(btrim(bot_description), ''), NULLIF(btrim(description), '')),
  connection_status = CASE
    WHEN last_test_status = 'Success' THEN 'connected'
    WHEN last_test_status = 'Failed' THEN 'error'
    ELSE COALESCE(connection_status, 'not_verified')
  END,
  webhook_status = CASE
    WHEN webhook_url IS NOT NULL AND btrim(webhook_url) <> '' THEN 'configured'
    ELSE COALESCE(webhook_status, 'not_configured')
  END,
  last_webhook_setup_at = CASE
    WHEN webhook_url IS NOT NULL AND btrim(webhook_url) <> '' THEN COALESCE(last_webhook_setup_at, updated_at, now())
    ELSE last_webhook_setup_at
  END,
  updated_at = COALESCE(updated_at, now());
