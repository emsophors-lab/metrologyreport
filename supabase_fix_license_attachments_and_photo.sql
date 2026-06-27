-- =========================================================================
--  NATIONAL METROLOGY CENTER OF CAMBODIA (NMC) - ENTERPRISE LICENSING SYSTEM
--  SUPABASE DATABASE FIXES - ATTACHMENT METADATA AND OWNER PHOTO SCHEMA
-- =========================================================================

-- 1. Safely add columns to public.enterprise_license_attachments table if they don't exist
ALTER TABLE public.enterprise_license_attachments
ADD COLUMN IF NOT EXISTS document_type TEXT;

ALTER TABLE public.enterprise_license_attachments
ADD COLUMN IF NOT EXISTS document_number TEXT;

ALTER TABLE public.enterprise_license_attachments
ADD COLUMN IF NOT EXISTS document_date DATE;

ALTER TABLE public.enterprise_license_attachments
ADD COLUMN IF NOT EXISTS document_status TEXT DEFAULT 'Uploaded';

ALTER TABLE public.enterprise_license_attachments
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

ALTER TABLE public.enterprise_license_attachments
ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT false;

ALTER TABLE public.enterprise_license_attachments
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

ALTER TABLE public.enterprise_license_attachments
ADD COLUMN IF NOT EXISTS verified_by TEXT;

ALTER TABLE public.enterprise_license_attachments
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- 2. Safely add owner photo columns to public.enterprise_licenses table if they don't exist
ALTER TABLE public.enterprise_licenses
ADD COLUMN IF NOT EXISTS license_owner_photo_url TEXT;

ALTER TABLE public.enterprise_licenses
ADD COLUMN IF NOT EXISTS license_owner_photo_path TEXT;

ALTER TABLE public.enterprise_licenses
ADD COLUMN IF NOT EXISTS license_owner_photo_file_name TEXT;

ALTER TABLE public.enterprise_licenses
ADD COLUMN IF NOT EXISTS license_owner_photo_uploaded_at TIMESTAMPTZ;

-- =========================================================================
--  STORAGE BUCKET SETUP DOCUMENTATION / VERIFICATION
-- =========================================================================
-- Ensure the following storage buckets exist and are public:
-- 1. 'license-owner-photos'
-- 2. 'enterprise-license-attachments'
-- 3. 'enterprise-license-certificates'
-- 
-- The following SQL snippet creates the buckets if using Supabase Storage API extensions:
-- =========================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('license-owner-photos', 'license-owner-photos', true),
  ('enterprise-license-attachments', 'enterprise-license-attachments', true),
  ('enterprise-license-certificates', 'enterprise-license-certificates', true)
ON CONFLICT (id) DO NOTHING;
