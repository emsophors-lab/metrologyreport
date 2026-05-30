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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

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
-- 3. Row Level Security Policies (RLS)
-- -------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Select policies
CREATE POLICY "Public select access for users authentication" ON users
  FOR SELECT USING (true);

-- Superadmin full operations on users
CREATE POLICY "Superadmin complete control on users" ON users
  FOR ALL USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'superadmin'
  );

-- Admins and owner selects reports
CREATE POLICY "Users can query their own reports and admin inspects everything" ON reports
  FOR SELECT USING (
    user_id = auth.uid() OR
    (SELECT role FROM users WHERE id = auth.uid()) IN ('superadmin', 'admin')
  );

-- Insert reports policy
CREATE POLICY "Registered enterprises can post report if can_save is true" ON reports
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    (SELECT can_save FROM users WHERE id = auth.uid()) = true
  );

-- Update reports policy
CREATE POLICY "Owners can update report if can_edit is true" ON reports
  FOR UPDATE USING (
    user_id = auth.uid() AND
    (SELECT can_edit FROM users WHERE id = auth.uid()) = true
  );

-- Delete reports policy
CREATE POLICY "Owners can delete report if can_delete is true" ON reports
  FOR DELETE USING (
    user_id = auth.uid() AND
    (SELECT can_delete FROM users WHERE id = auth.uid()) = true
  );
