-- Telegram Bot Settings status compatibility migration
-- Safe to run multiple times.

ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS bot_purpose TEXT DEFAULT 'license_reminder';
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS default_group_chat_id TEXT;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS connection_status TEXT DEFAULT 'not_verified';
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS webhook_status TEXT DEFAULT 'not_configured';
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS bot_display_name TEXT;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE telegram_bot_settings
SET
  connection_status = CASE
    WHEN last_test_status = 'Success' THEN 'connected'
    WHEN last_test_status = 'Failed' THEN 'error'
    ELSE COALESCE(connection_status, 'not_verified')
  END,
  webhook_status = CASE
    WHEN webhook_url IS NOT NULL AND btrim(webhook_url) <> '' THEN 'configured'
    ELSE COALESCE(webhook_status, 'not_configured')
  END,
  updated_at = COALESCE(updated_at, now());
