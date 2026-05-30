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
