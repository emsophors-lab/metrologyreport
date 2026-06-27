-- =========================================================================
--  NATIONAL METROLOGY CENTER OF CAMBODIA (NMC) - ENTERPRISE LICENSING SYSTEM
--  SUPABASE DATABASE MIGRATION SCRIPT - LEGAL REPRESENTATIVE COLUMNS
-- =========================================================================

-- Safe alter statements to ensure legal representative columns exist on enterprise_licenses
ALTER TABLE public.enterprise_licenses
ADD COLUMN IF NOT EXISTS representative_date_of_birth DATE;

ALTER TABLE public.enterprise_licenses
ADD COLUMN IF NOT EXISTS representative_gender TEXT;

ALTER TABLE public.enterprise_licenses
ADD COLUMN IF NOT EXISTS representative_nationality TEXT;
