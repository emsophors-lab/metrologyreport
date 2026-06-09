-- =========================================================================
--  NATIONAL METROLOGY CENTER OF CAMBODIA (NMC) - MONTHLY REPORTER DATABASE
--  SUPABASE / POSTGRES TABLE CREATION & SECURITY POLICY CONFIGURATION
-- =========================================================================

-- DROP TABLES IF YOU WANT TO RESET:
-- DROP TABLE IF EXISTS reports CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;

-- -------------------------------------------------------------------------
-- 1. Create table for users (licensee enterprises & administrative officials)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, -- Using TEXT to maintain compatibility with custom user strings
  license_number TEXT NOT NULL,
  company_name_kh TEXT NOT NULL,
  company_name_en TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  legal_representative TEXT NOT NULL,
  representative_position TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL, -- Stored credentials for secure local authentication
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'company')),
  can_view BOOLEAN NOT NULL DEFAULT TRUE,
  can_edit BOOLEAN NOT NULL DEFAULT TRUE,
  can_save BOOLEAN NOT NULL DEFAULT TRUE,
  can_delete BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  admin_can_add_company_user BOOLEAN DEFAULT FALSE,
  admin_can_add_admin_user BOOLEAN DEFAULT FALSE,
  admin_can_edit_users BOOLEAN DEFAULT FALSE,
  admin_can_deactivate_users BOOLEAN DEFAULT FALSE,
  admin_can_view_all_users BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE
);

-- Note: For existing databases, you can apply these schema adjustments by running the following commands in Supabase SQL Editor:
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_can_add_company_user BOOLEAN DEFAULT FALSE;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_can_add_admin_user BOOLEAN DEFAULT FALSE;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_can_edit_users BOOLEAN DEFAULT FALSE;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_can_deactivate_users BOOLEAN DEFAULT FALSE;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_can_view_all_users BOOLEAN DEFAULT FALSE;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- -------------------------------------------------------------------------
-- 2. Create table for monthly reports
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  license_number TEXT NOT NULL,
  company_name_kh TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_address TEXT NOT NULL,
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- -------------------------------------------------------------------------
-- 3. Row Level Security Policies (RLS) Configuration
-- -------------------------------------------------------------------------
-- NOTE: Since this application authenticates using a custom client-side system and 
-- stores users in a standard table (rather than Supabase native Auth emails), auth.uid() 
-- will always return NULL for anonymous client requests. 
-- To prevent infinite recursion and HTTP 500 errors in PostgREST, we configure simple 
-- public policies for reading/writing.
--
-- For strict production security, we recommend disabling client-direct writes and 
-- proxying via a server, or using Supabase Native Auth. For this design format:

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Select policies
CREATE POLICY "Public Read Access for Users" ON users
  FOR SELECT USING (true);

-- Insert/Update/Delete policies for users
CREATE POLICY "Public Write Access for Users" ON users
  FOR ALL USING (true) WITH CHECK (true);

-- Select reports
CREATE POLICY "Public Read Access for Reports" ON reports
  FOR SELECT USING (true);

-- Write reports (Insert/Update/Delete)
CREATE POLICY "Public Write Access for Reports" ON reports
  FOR ALL USING (true) WITH CHECK (true);


-- -------------------------------------------------------------------------
-- 4. Create table for login history (security & session logs)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_role TEXT NOT NULL,
  company_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  login_status TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  device_info TEXT,
  login_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;

-- Select policy for login history logs
CREATE POLICY "Public Read Access for Login History" ON login_history
  FOR SELECT USING (true);

-- Insert policy for login history logs
CREATE POLICY "Public Write Access for Login History" ON login_history
  FOR INSERT WITH CHECK (true);


