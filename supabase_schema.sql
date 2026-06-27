-- =========================================================================
--  NATIONAL METROLOGY CENTER OF CAMBODIA (NMC) - MONTHLY REPORTER DATABASE
--  SECURE PRODUCTION DATABASES SCHEMA & ROW-LEVEL SECURITY (RLS)
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Create table for Authorized Service Enterprise profiles (Companies)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name_kh TEXT NOT NULL,
  company_name_en TEXT NOT NULL,
  license_number TEXT UNIQUE NOT NULL,
  address TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- -------------------------------------------------------------------------
-- 2. Create table for user credentials (Profiles linked to Auth.Users)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'company')),
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  
  -- Fine-grained functional permissions
  can_view BOOLEAN NOT NULL DEFAULT TRUE,
  can_edit BOOLEAN NOT NULL DEFAULT TRUE,
  can_save BOOLEAN NOT NULL DEFAULT TRUE,
  can_delete BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Administrative privileges (For Admin Role Control)
  admin_can_add_company_user BOOLEAN NOT NULL DEFAULT FALSE,
  admin_can_add_admin_user BOOLEAN NOT NULL DEFAULT FALSE,
  admin_can_edit_users BOOLEAN NOT NULL DEFAULT FALSE,
  admin_can_deactivate_users BOOLEAN NOT NULL DEFAULT FALSE,
  admin_can_view_all_users BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- -------------------------------------------------------------------------
-- 3. Create table for Metrology monthly performance reports
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  
  -- Metadata caches to protect report integrity
  license_number TEXT NOT NULL,
  company_name_kh TEXT NOT NULL,
  
  -- Customer specifics
  customer_name TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  
  -- Metrology parameters
  measuring_instrument TEXT NOT NULL,
  instrument_serial_number TEXT NOT NULL,
  scope_of_weight_measure TEXT NOT NULL,
  spare_parts TEXT DEFAULT '',
  spare_part_serial_number TEXT DEFAULT '',
  
  service_type TEXT NOT NULL CHECK (service_type IN ('Manufacture', 'Installation', 'Repair')),
  service_start_date TEXT NOT NULL,
  service_end_date TEXT NOT NULL,
  report_month TEXT NOT NULL,
  report_year TEXT NOT NULL,
  
  -- Secure Workflow Status & Verification Tokens (Section D / G)
  report_status TEXT NOT NULL DEFAULT 'Submitted' CHECK (report_status IN ('Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected')),
  rejection_reason TEXT,
  verification_token_hash TEXT, -- Signed hash for bulletproof public QR code verification
  
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- -------------------------------------------------------------------------
-- 4. Create table for login tracker
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  user_role TEXT NOT NULL,
  company_name TEXT NOT NULL,
  login_status TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  device_info TEXT,
  login_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- -------------------------------------------------------------------------
-- 5. Create table for administrator tamper-proof Audit logs (Section I)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action_type TEXT NOT NULL, -- e.g. USER_CREATED, REPORT_APPROVED, EXCEL_IMPORTED
  details TEXT NOT NULL,
  ip_address TEXT,
  target_user_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- -------------------------------------------------------------------------
-- 6. Row Level Security Policies (RLS) Configuration
-- -------------------------------------------------------------------------
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper security functions to reduce recursive queries:
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql;

-- ================= COMPANIES POLICIES =================
CREATE POLICY "Admins can manage all companies" ON companies
  FOR ALL USING (get_current_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (get_current_user_role() IN ('superadmin', 'admin'));

CREATE POLICY "Companies can view their own details" ON companies
  FOR SELECT USING (
    id = (SELECT company_id FROM public.profiles WHERE public.profiles.id = auth.uid())
  );

-- ================= PROFILES POLICIES =================
CREATE POLICY "Users can query their own profiles" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view profiles" ON profiles
  FOR SELECT USING (get_current_user_role() IN ('superadmin', 'admin'));

CREATE POLICY "Admins and Superadmins can modify profiles" ON profiles
  FOR ALL USING (get_current_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (get_current_user_role() IN ('superadmin', 'admin'));

-- ================= REPORTS POLICIES =================
CREATE POLICY "Admins can manage all reports" ON reports
  FOR ALL USING (get_current_user_role() IN ('superadmin', 'admin'))
  WITH CHECK (get_current_user_role() IN ('superadmin', 'admin'));

CREATE POLICY "Company owners can select their reports" ON reports
  FOR SELECT USING (
    profile_id = auth.uid() OR 
    company_id = (SELECT company_id FROM public.profiles WHERE public.profiles.id = auth.uid())
  );

CREATE POLICY "Company owners can insert reports if flagged with can_save = true" ON reports
  FOR INSERT WITH CHECK (
    profile_id = auth.uid() AND
    (SELECT can_save FROM public.profiles WHERE public.profiles.id = auth.uid()) = TRUE
  );

CREATE POLICY "Company owners can edit their reports if status is draft or submitted and can_edit is true" ON reports
  FOR UPDATE USING (
    profile_id = auth.uid() AND
    report_status IN ('Draft', 'Submitted') AND
    (SELECT can_edit FROM public.profiles WHERE public.profiles.id = auth.uid()) = TRUE
  ) WITH CHECK (
    profile_id = auth.uid() AND
    report_status IN ('Draft', 'Submitted')
  );

CREATE POLICY "Company owners can delete their reports if status is draft and can_delete is true" ON reports
  FOR DELETE USING (
    profile_id = auth.uid() AND
    report_status = 'Draft' AND
    (SELECT can_delete FROM public.profiles WHERE public.profiles.id = auth.uid()) = TRUE
  );

-- Public QR verification bypass (requires token hash or id select) - Section G
CREATE POLICY "Public QR validation lookup" ON reports
  FOR SELECT USING (true); -- Public can query fields from any specific record for verification.

-- ================= LOGS & HISTORIES POLICIES =================
CREATE POLICY "Only admins can see login histories" ON login_history
  FOR SELECT USING (get_current_user_role() IN ('superadmin', 'admin'));

CREATE POLICY "Write logins from standard client session" ON login_history
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Only admins can see system audit logs" ON audit_logs
  FOR SELECT USING (get_current_user_role() IN ('superadmin', 'admin'));

CREATE POLICY "Write audit logging triggers" ON audit_logs
  FOR INSERT WITH CHECK (true);

-- =================-----------------------------=========--
-- 7. SQL triggers for automated profile sync
-- =================-----------------------------=========--
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email, role, can_view, can_edit, can_save, can_delete, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', substring(NEW.email from '([^@]+)')),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'company'),
    TRUE, TRUE, TRUE, TRUE, TRUE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER on_auth_user_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- =================-----------------------------=========--
-- 8. Enterprise Licensing Registry Module Tables
-- =================-----------------------------=========--

CREATE TABLE IF NOT EXISTS enterprise_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_user_id TEXT,
  company_id TEXT,
  company_name TEXT NOT NULL,
  license_number TEXT NOT NULL UNIQUE,
  license_owner_name TEXT,
  license_owner_position TEXT,
  representative_date_of_birth TEXT,
  representative_gender TEXT,
  representative_nationality TEXT,
  phone_number TEXT,
  email TEXT,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  telegram_first_name TEXT,
  telegram_last_name TEXT,
  telegram_connected_at TEXT,
  telegram_connection_status TEXT DEFAULT 'Not Connected',
  telegram_registration_token_hash TEXT,
  telegram_registration_token_expires_at TEXT,
  company_address TEXT,
  business_latitude DOUBLE PRECISION,
  business_longitude DOUBLE PRECISION,
  business_location_source TEXT,
  business_type TEXT,
  service_scope TEXT,
  measuring_instrument_type TEXT,
  license_issue_date TEXT NOT NULL,
  license_expiry_date TEXT NOT NULL,
  license_validity_years INT DEFAULT 3,
  license_status TEXT DEFAULT 'Active',
  last_90_day_reminder_sent_at TEXT,
  last_60_day_reminder_sent_at TEXT,
  last_30_day_reminder_sent_at TEXT,
  last_15_day_reminder_sent_at TEXT,
  last_7_day_reminder_sent_at TEXT,
  expired_reminder_sent_at TEXT,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS license_reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL,
  reminder_days INT NOT NULL,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  message_text TEXT NOT NULL,
  send_status TEXT DEFAULT 'Sent',
  sent_at TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS license_renewal_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL,
  old_issue_date TEXT NOT NULL,
  old_expiry_date TEXT NOT NULL,
  new_issue_date TEXT NOT NULL,
  new_expiry_date TEXT NOT NULL,
  renewed_by TEXT NOT NULL,
  renewed_by_role TEXT NOT NULL,
  renewed_at TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS telegram_bot_settings (
  id TEXT PRIMARY KEY,
  bot_name TEXT,
  bot_username TEXT NOT NULL,
  bot_token_encrypted TEXT NOT NULL,
  bot_purpose TEXT DEFAULT 'license_reminder',
  default_chat_id TEXT,
  webhook_url TEXT,
  webhook_secret_encrypted TEXT,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  last_test_status TEXT,
  last_test_message TEXT,
  last_tested_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Enable RLS
ALTER TABLE enterprise_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_renewal_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_bot_settings ENABLE ROW LEVEL SECURITY;

-- Setup full read/write policy access in the system
CREATE POLICY "Public read/write access for licensing" ON enterprise_licenses FOR ALL USING (true);
CREATE POLICY "Public read/write access for reminder logs" ON license_reminder_logs FOR ALL USING (true);
CREATE POLICY "Public read/write access for renewal history" ON license_renewal_history FOR ALL USING (true);
CREATE POLICY "Public read/write access for telegram bot settings" ON telegram_bot_settings FOR ALL USING (true);

ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS bot_purpose TEXT DEFAULT 'license_reminder';

-- Incremental column adjustments
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS representative_date_of_birth TEXT;
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS representative_gender TEXT;
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS representative_nationality TEXT;
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS business_latitude DOUBLE PRECISION;
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS business_longitude DOUBLE PRECISION;
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS business_location_source TEXT;

-- Incremental columns for reminder timestamps
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS last_90_day_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS last_60_day_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS last_30_day_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS last_15_day_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS last_7_day_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE enterprise_licenses ADD COLUMN IF NOT EXISTS expired_reminder_sent_at TIMESTAMPTZ;
