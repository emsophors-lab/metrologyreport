-- =========================================================================
--  NATIONAL METROLOGY CENTER OF CAMBODIA (NMC) - ENTERPRISE LICENSING SYSTEM
--  SUPABASE DATABASE MIGRATION SCRIPT FOR PHASES & TELEGRAM BOT CONFIG
-- =========================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------------------------
-- 1. Create table for Enterprise Licenses
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enterprise_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_user_id TEXT,
  company_id TEXT,
  company_name TEXT NOT NULL,
  company_name_kh TEXT,
  license_number TEXT NOT NULL UNIQUE,
  company_address TEXT,
  province_city TEXT,
  district_khan TEXT,
  commune_sangkat TEXT,
  village TEXT,
  business_latitude DOUBLE PRECISION,
  business_longitude DOUBLE PRECISION,
  business_location_source TEXT,
  phone_number TEXT,
  email TEXT,
  business_type TEXT,
  service_scope TEXT,
  measuring_instrument_type TEXT,
  
  -- Owner fields
  license_owner_name TEXT,
  license_owner_position TEXT,
  license_owner_national_id TEXT,
  license_owner_phone TEXT,
  license_owner_email TEXT,
  license_owner_photo_url TEXT,
  license_owner_photo_path TEXT,
  
  -- Representative additional details
  representative_date_of_birth DATE,
  representative_gender TEXT,
  representative_nationality TEXT,

  -- License fields
  license_issue_date DATE NOT NULL,
  license_expiry_date DATE NOT NULL,
  license_validity_years INTEGER DEFAULT 3,
  license_status TEXT DEFAULT 'Active',
  approved_by TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,

  -- Service fee fields
  service_fee_amount NUMERIC,
  service_fee_currency TEXT DEFAULT 'USD',
  payment_status TEXT DEFAULT 'Pending',
  payment_reference TEXT,
  payment_date DATE,
  payment_notes TEXT,

  -- Client portal credentials
  client_username TEXT,
  client_password TEXT,

  -- Certificate & QR fields
  certificate_pdf_url TEXT,
  certificate_pdf_path TEXT,
  qr_verification_token TEXT,
  qr_verification_url TEXT,
  qr_code_data TEXT,
  certificate_generated_at TIMESTAMP WITH TIME ZONE,
  certificate_generated_by TEXT,

  -- Telegram fields
  telegram_chat_id TEXT,
  telegram_username TEXT,
  telegram_first_name TEXT,
  telegram_last_name TEXT,
  telegram_connected_at TIMESTAMP WITH TIME ZONE,
  telegram_connection_status TEXT DEFAULT 'Not Connected',
  telegram_registration_token_hash TEXT,
  telegram_registration_token_expires_at TIMESTAMP WITH TIME ZONE,
  telegram_bot_setting_id UUID,
  last_60_day_reminder_sent_at TIMESTAMP WITH TIME ZONE,
  last_30_day_reminder_sent_at TIMESTAMP WITH TIME ZONE,
  last_7_day_reminder_sent_at TIMESTAMP WITH TIME ZONE,
  expired_reminder_sent_at TIMESTAMP WITH TIME ZONE,

  -- System metadata
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- CREATE INDEXES FOR CRITICAL QUERY PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_license_number ON enterprise_licenses(license_number);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_company_name ON enterprise_licenses(company_name);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_expiry_date ON enterprise_licenses(license_expiry_date);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_status ON enterprise_licenses(license_status);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_qr_token ON enterprise_licenses(qr_verification_token);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_telegram_chat_id ON enterprise_licenses(telegram_chat_id);


-- -------------------------------------------------------------------------
-- 2. Create table for Enterprise License Attachments
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enterprise_license_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID REFERENCES enterprise_licenses(id) ON DELETE CASCADE,
  document_type TEXT,
  document_number TEXT,
  document_date DATE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  file_url TEXT,
  file_path TEXT,
  attachment_category TEXT,
  uploaded_by TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notes TEXT
);


-- -------------------------------------------------------------------------
-- 3. Create table for Telegram Bot Settings
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS telegram_bot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_name TEXT,
  bot_username TEXT NOT NULL,
  bot_token_encrypted TEXT NOT NULL,
  bot_purpose TEXT DEFAULT 'report_group',
  default_chat_id TEXT,
  default_group_chat_id TEXT,
  webhook_url TEXT,
  last_webhook_setup_at TIMESTAMP WITH TIME ZONE,
  webhook_secret_encrypted TEXT,
  is_active BOOLEAN DEFAULT true,
  description TEXT,
  bot_description TEXT,
  last_test_status TEXT,
  last_test_message TEXT,
  last_tested_at TIMESTAMP WITH TIME ZONE,
  connection_status TEXT DEFAULT 'not_verified',
  last_error TEXT,
  webhook_status TEXT DEFAULT 'not_configured',
  bot_display_name TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);


-- -------------------------------------------------------------------------
-- 4. Create table for Telegram Reminder Delivery Logs
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS license_reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID REFERENCES enterprise_licenses(id) ON DELETE CASCADE,
  telegram_bot_setting_id UUID REFERENCES telegram_bot_settings(id) ON DELETE SET NULL,
  reminder_type TEXT, -- e.g., '60_DAY', '30_DAY', '7_DAY', 'EXPIRED', 'TEST'
  reminder_days INTEGER,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  message_text TEXT,
  send_status TEXT DEFAULT 'Skipped',
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);


-- -------------------------------------------------------------------------
-- 5. Create table for License Renewal History
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS license_renewal_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID REFERENCES enterprise_licenses(id) ON DELETE CASCADE,
  old_issue_date DATE,
  old_expiry_date DATE,
  new_issue_date DATE,
  new_expiry_date DATE,
  renewed_by TEXT,
  renewed_by_role TEXT,
  renewed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notes TEXT
);


-- =========================================================================
-- 6. ROW-LEVEL SECURITY (RLS) POLICIES
-- =========================================================================
ALTER TABLE enterprise_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_license_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_renewal_history ENABLE ROW LEVEL SECURITY;

-- Note: The policies below are tailored to permit public read/write in debug/sandbox 
-- development setups to ensure immediate visual success within the AI Studio editor frame.
-- For production systems, you should lock these down based on roles or user IDs.

DROP POLICY IF EXISTS "Public full access to licenses in dev" ON enterprise_licenses;
CREATE POLICY "Public full access to licenses in dev" ON enterprise_licenses FOR ALL USING (true);

DROP POLICY IF EXISTS "Public full access to attachments in dev" ON enterprise_license_attachments;
CREATE POLICY "Public full access to attachments in dev" ON enterprise_license_attachments FOR ALL USING (true);

DROP POLICY IF EXISTS "Public full access to telegram bots in dev" ON telegram_bot_settings;
CREATE POLICY "Public full access to telegram bots in dev" ON telegram_bot_settings FOR ALL USING (true);

DROP POLICY IF EXISTS "Public full access to reminder logs in dev" ON license_reminder_logs;
CREATE POLICY "Public full access to reminder logs in dev" ON license_reminder_logs FOR ALL USING (true);

DROP POLICY IF EXISTS "Public full access to renewal history in dev" ON license_renewal_history;
CREATE POLICY "Public full access to renewal history in dev" ON license_renewal_history FOR ALL USING (true);


-- =========================================================================
-- 7. STORAGE BUCKETS SETUP POLICIES
-- =========================================================================
-- Run the following script in Supabase SQL editor to programmatically 
-- provision required storage buckets:
--
-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('license-owner-photos', 'license-owner-photos', true) 
-- ON CONFLICT (id) DO NOTHING;
--
-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('enterprise-license-attachments', 'enterprise-license-attachments', false) 
-- ON CONFLICT (id) DO NOTHING;
--
-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('enterprise-license-certificates', 'enterprise-license-certificates', true) 
-- ON CONFLICT (id) DO NOTHING;
--

-- =========================================================================
-- 8. INCREMENTAL COLUMNS FOR LEGAL REPRESENTATIVE DETAILS & MAP COORDINATES
-- =========================================================================
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS representative_date_of_birth DATE;
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS representative_gender TEXT;
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS representative_nationality TEXT;
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS business_latitude DOUBLE PRECISION;
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS business_longitude DOUBLE PRECISION;
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS business_location_source TEXT;

-- 9. INCREMENTAL COLUMNS FOR LEGAL REPRESENTATIVE PHOTO & ATTACHMENT METADATA
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS license_owner_photo_url TEXT;
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS license_owner_photo_path TEXT;

ALTER TABLE enterprise_license_attachments ADD COLUMN IF NOT EXISTS document_type TEXT;
ALTER TABLE enterprise_license_attachments ADD COLUMN IF NOT EXISTS document_number TEXT;
ALTER TABLE enterprise_license_attachments ADD COLUMN IF NOT EXISTS document_date DATE;
ALTER TABLE enterprise_license_attachments ADD COLUMN IF NOT EXISTS notes TEXT;

-- 10. INCREMENTAL COLUMNS FOR REMINDER TIMESTAMPS
ALTER TABLE public.enterprise_licenses ADD COLUMN IF NOT EXISTS last_90_day_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE public.enterprise_licenses ADD COLUMN IF NOT EXISTS last_60_day_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE public.enterprise_licenses ADD COLUMN IF NOT EXISTS last_30_day_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE public.enterprise_licenses ADD COLUMN IF NOT EXISTS last_15_day_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE public.enterprise_licenses ADD COLUMN IF NOT EXISTS last_7_day_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE public.enterprise_licenses ADD COLUMN IF NOT EXISTS expired_reminder_sent_at TIMESTAMPTZ;

-- 11. INCREMENTAL COLUMN FOR MULTIPLE TELEGRAM BOT PURPOSES
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS bot_purpose TEXT DEFAULT 'report_group';
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS default_group_chat_id TEXT;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS bot_display_name TEXT;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS connection_status TEXT DEFAULT 'not_verified';
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS webhook_status TEXT DEFAULT 'not_configured';
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS last_webhook_setup_at TIMESTAMPTZ;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS bot_description TEXT;
ALTER TABLE telegram_bot_settings ALTER COLUMN bot_purpose SET DEFAULT 'report_group';

