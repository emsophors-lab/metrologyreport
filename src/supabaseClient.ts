import { createClient } from '@supabase/supabase-js';

// We initialize the client lazily or safely. If parameters are not set, we can return null.
export function getSupabaseClient(url: string, anonKey: string) {
  if (!url || !anonKey || url === 'YOUR_SUPABASE_URL' || anonKey === 'YOUR_SUPABASE_ANON_KEY') {
    return null;
  }
  try {
    return createClient(url, anonKey);
  } catch (error) {
    console.warn('Failed to initialize Supabase client:', error);
    return null;
  }
}

export const SQL_INITIALIZATION_SCRIPT = `-- =========================================================================
--  NATIONAL METROLOGY CENTER OF CAMBODIA (NMC) - MONTHLY REPORTER DATABASE
--  SUPABASE / POSTGRES TABLE CREATION & SECURITY POLICY CONFIGURATION
-- =========================================================================

-- DROP TABLES IF YOU WANT TO RESET:
-- DROP TABLE IF EXISTS reports CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;

-- 1. Create table for users (licensee enterprises & administrative officials)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, -- Maintain compatibility with all custom login user structures
  license_number TEXT NOT NULL,
  company_name_kh TEXT NOT NULL,
  company_name_en TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  legal_representative TEXT NOT NULL,
  representative_position TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL, 
  password_hash TEXT,
  password_updated_at TIMESTAMP WITH TIME ZONE,
  must_change_password BOOLEAN DEFAULT FALSE,
  last_password_change_by TEXT,
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'company')),
  can_view BOOLEAN NOT NULL DEFAULT TRUE,
  can_edit BOOLEAN NOT NULL DEFAULT TRUE,
  can_save BOOLEAN NOT NULL DEFAULT TRUE,
  can_delete BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 2. Create table for monthly reports
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

-- 3. Row Level Security Policies (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Select policies
CREATE POLICY "Public select access for users authentication" ON users
  FOR SELECT USING (true);

-- Superadmin full operations on users
CREATE POLICY "Superadmin complete control on users" ON users
  FOR ALL USING (
    (SELECT role FROM users WHERE id = auth.uid()::text) = 'superadmin'
  );

-- Admins and owner selects reports
CREATE POLICY "Users can query their own reports and admin inspects everything" ON reports
  FOR SELECT USING (
    user_id = auth.uid()::text OR
    (SELECT role FROM users WHERE id = auth.uid()::text) IN ('superadmin', 'admin')
  );

-- Insert reports policy
CREATE POLICY "Registered enterprises can post report if can_save is true" ON reports
  FOR INSERT WITH CHECK (
    user_id = auth.uid()::text AND
    (SELECT can_save FROM users WHERE id = auth.uid()::text) = true
  );

-- Update reports policy
CREATE POLICY "Owners can update report if can_edit is true" ON reports
  FOR UPDATE USING (
    user_id = auth.uid()::text AND
    (SELECT can_edit FROM users WHERE id = auth.uid()::text) = true
  );

-- Delete reports policy
CREATE POLICY "Owners can delete report if can_delete is true" ON reports
  FOR DELETE USING (
    user_id = auth.uid()::text AND
    (SELECT can_delete FROM users WHERE id = auth.uid()::text) = true
  );

-- 4. Create table for login_history and default policies
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

-- Allow public read/write access to login history (similar to simple public model)
CREATE POLICY "Public select access for login history logs" ON login_history
  FOR SELECT USING (true);

CREATE POLICY "Public insert access for login history logs" ON login_history
  FOR INSERT WITH CHECK (true);

-- 5. Enterprise Licensing Registry Module Tables
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
  phone_number TEXT,
  email TEXT,
  business_type TEXT,
  service_scope TEXT,
  measuring_instrument_type TEXT,
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

  -- Map location details
  business_latitude DOUBLE PRECISION,
  business_longitude DOUBLE PRECISION,
  business_location_source TEXT,
  business_geo_address TEXT,
  location_updated_at TIMESTAMP WITH TIME ZONE,
  license_issue_date DATE NOT NULL,
  license_expiry_date DATE NOT NULL,
  license_validity_years INTEGER DEFAULT 3,
  license_status TEXT DEFAULT 'Active',
  approved_by TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  service_fee_amount NUMERIC,
  service_fee_currency TEXT DEFAULT 'USD',
  payment_status TEXT DEFAULT 'Pending',
  payment_reference TEXT,
  payment_date DATE,
  payment_notes TEXT,
  client_username TEXT,
  client_password TEXT,
  certificate_pdf_url TEXT,
  certificate_pdf_path TEXT,
  qr_verification_token TEXT,
  qr_verification_url TEXT,
  qr_code_data TEXT,
  certificate_generated_at TIMESTAMP WITH TIME ZONE,
  certificate_generated_by TEXT,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  telegram_first_name TEXT,
  telegram_last_name TEXT,
  telegram_connected_at TIMESTAMP WITH TIME ZONE,
  telegram_connection_status TEXT DEFAULT 'Not Connected',
  telegram_registration_token_hash TEXT,
  telegram_registration_token_expires_at TIMESTAMP WITH TIME ZONE,
  telegram_bot_setting_id UUID,
  last_90_day_reminder_sent_at TIMESTAMP WITH TIME ZONE,
  last_60_day_reminder_sent_at TIMESTAMP WITH TIME ZONE,
  last_30_day_reminder_sent_at TIMESTAMP WITH TIME ZONE,
  last_15_day_reminder_sent_at TIMESTAMP WITH TIME ZONE,
  last_7_day_reminder_sent_at TIMESTAMP WITH TIME ZONE,
  expired_reminder_sent_at TIMESTAMP WITH TIME ZONE,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enterprise_license_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID REFERENCES enterprise_licenses(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS license_reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID REFERENCES enterprise_licenses(id) ON DELETE CASCADE,
  telegram_bot_setting_id UUID REFERENCES telegram_bot_settings(id) ON DELETE SET NULL,
  reminder_type TEXT,
  reminder_days INTEGER,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  message_text TEXT,
  send_status TEXT DEFAULT 'Skipped',
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_license_number ON enterprise_licenses(license_number);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_company_name ON enterprise_licenses(company_name);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_expiry_date ON enterprise_licenses(license_expiry_date);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_status ON enterprise_licenses(license_status);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_qr_token ON enterprise_licenses(qr_verification_token);
CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_telegram_chat_id ON enterprise_licenses(telegram_chat_id);

-- Enable RLS for Licensing Modules
ALTER TABLE enterprise_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_license_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_renewal_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_bot_settings ENABLE ROW LEVEL SECURITY;

-- Setup full read/write policy access in the system
CREATE POLICY "Public read/write access for licensing" ON enterprise_licenses FOR ALL USING (true);
CREATE POLICY "Public read/write access for attachments" ON enterprise_license_attachments FOR ALL USING (true);
CREATE POLICY "Public read/write access for reminder logs" ON license_reminder_logs FOR ALL USING (true);
CREATE POLICY "Public read/write access for renewal history" ON license_renewal_history FOR ALL USING (true);
CREATE POLICY "Public read/write access for telegram bot settings" ON telegram_bot_settings FOR ALL USING (true);

ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS bot_purpose TEXT DEFAULT 'report_group';
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS default_group_chat_id TEXT;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS connection_status TEXT DEFAULT 'not_verified';
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS webhook_status TEXT DEFAULT 'not_configured';
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS last_webhook_setup_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS bot_display_name TEXT;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS bot_description TEXT;
ALTER TABLE telegram_bot_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE telegram_bot_settings ALTER COLUMN bot_purpose SET DEFAULT 'report_group';

`;

export const GITHUB_DEPLOYMENT_INSTRUCTIONS = `
# How to Deploy to GitHub and Vercel

### Step 1: Initial Git Setup
Initialize repository on your local computer, add your files, and commit:
\`\`\`bash
git init
git add .
git commit -m "Initial commit of Metrology Monthly Report App"
\`\`\`

### Step 2: Push to GitHub
Create a new repository on **GitHub** (do not initialize with README), then run:
\`\`\`bash
git remote add origin https://github.com/your-username/metrology-report-app.git
git branch -M main
git push -u origin main
\`\`\`

### Step 3: Deploy to Vercel
1. Log in to your [Vercel Dashboard](https://vercel.com).
2. Click **Add New** -> **Project**.
3. Select your imported GitHub repository \`metrology-report-app\`.
4. Leave standard settings (Vercel automatically detects the Vite build command).
5. Under **Environment Variables**, add:
   - \`VITE_SUPABASE_URL\` = Your Supabase URL
   - \`VITE_SUPABASE_ANON_KEY\` = Your Supabase Anon Key
6. Click **Deploy**. Your app will be live with an SSL certificate in less than a minute!
`;

export const SUPABASE_SETUP_INSTRUCTIONS = `
# Guidelines for Connecting Supabase Cloud Database

To transition this application from Local Storage (Demo Mode) to a production database, please follow these steps:

### 1. Create a Project on Supabase
- Go to [Supabase.com](https://supabase.com) and sign in or create an account.
- Click **New Project**, select an organization, and choose a regional database server closest to your users (e.g., Singapore \`ap-southeast-1\`).
- Save your Database Password carefully.

### 2. Set Up the Tables (SQL Script)
- Open the **SQL Editor** from the left navigation bar in the Supabase Dashboard.
- Click **New Query**.
- Copy and Paste the exact SQL Script shown in the standalone SQL script file or compile query below.
- Click **Run**. This will generate the necessary \`users\` and \`reports\` tables, constraints, and Row Level Security rules.

### 3. Copy API Credentials
- Go to **Project Settings** (gear icon) -> **API** in Supabase.
- Copy your **Project URL** and the **anon public API Key**.

### 4. Provide Credentials in the App
- Paste these credentials directly into the **"Supabase Link & Developer Studio"** panel below and toggle **"Activate Supabase Sync"**.
- Your application will automatically establish a live connection to write, edit, and read records straight from the cloud! Over GitHub and Vercel, simply input \`VITE_SUPABASE_URL\` and \`VITE_SUPABASE_ANON_KEY\` as environment variables!
`;
