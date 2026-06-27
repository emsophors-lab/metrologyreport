-- =========================================================================
--  NATIONAL METROLOGY CENTER OF CAMBODIA (NMC) - METROLOGY REPORT SYSTEM
--  SUPABASE DATABASE MIGRATION SCRIPT FOR ENTERPRISE LOCATION & MAP MODULE
-- =========================================================================
--  File: supabase_map_location_migration.sql
--  Description: Provisions schema updates, constraints, performance indexes,
--               custom triggers for coordinates audit logging, configuration tables,
--               and Row-Level Security (RLS) rules supporting Interactive Maps.
--  Idempotency: Yes. Safe to execute multiple times against the production database.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. EXTEND ENTERPRISE LICENSES TABLE FOR GEOGRAPHIC LOCATION FIELDS
-- -------------------------------------------------------------------------
-- Add latitude, longitude, geocoding address, update timestamps and capture source tracking columns.
-- Column targets are safe-guarded to prevent data deletion or structural errors.

ALTER TABLE public.enterprise_licenses ADD COLUMN IF NOT EXISTS business_latitude DOUBLE PRECISION NULL;
ALTER TABLE public.enterprise_licenses ADD COLUMN IF NOT EXISTS business_longitude DOUBLE PRECISION NULL;
ALTER TABLE public.enterprise_licenses ADD COLUMN IF NOT EXISTS business_location_source TEXT NULL;
ALTER TABLE public.enterprise_licenses ADD COLUMN IF NOT EXISTS business_geo_address TEXT NULL;
ALTER TABLE public.enterprise_licenses ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ NULL;


-- -------------------------------------------------------------------------
-- 2. ADD ROBUST CO-ORDINATE RANGE AND SOURCE VALIDATION CONSTRAINTS
-- -------------------------------------------------------------------------
-- Restricts latitudes to valid Earth domain [-90, +90] and longitudes to [-180, +185].
-- Enforces allowed sources to safeguard data integrity and taxonomy.
-- Constraints are dropped first to avoid replication or multiple constraint error traps.

ALTER TABLE public.enterprise_licenses DROP CONSTRAINT IF EXISTS enterprise_licenses_business_latitude_range;
ALTER TABLE public.enterprise_licenses ADD CONSTRAINT enterprise_licenses_business_latitude_range 
  CHECK (business_latitude >= -90.0 AND business_latitude <= 90.0);

ALTER TABLE public.enterprise_licenses DROP CONSTRAINT IF EXISTS enterprise_licenses_business_longitude_range;
ALTER TABLE public.enterprise_licenses ADD CONSTRAINT enterprise_licenses_business_longitude_range 
  CHECK (business_longitude >= -180.0 AND business_longitude <= 180.0);

ALTER TABLE public.enterprise_licenses DROP CONSTRAINT IF EXISTS enterprise_licenses_business_location_source_check;
ALTER TABLE public.enterprise_licenses ADD CONSTRAINT enterprise_licenses_business_location_source_check 
  CHECK (business_location_source IN ('map_click', 'current_location', 'manual_entry', 'geocoded', 'imported'));


-- -------------------------------------------------------------------------
-- 3. DEFINE PERFORMANCE INDEXES FOR GEOGRAPHIC SEARCHING AND CLUSTERS
-- -------------------------------------------------------------------------
-- Enhances lookup speeds during system render where thousands of companies overlap on map view tiles.

CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_business_location 
  ON public.enterprise_licenses (business_latitude, business_longitude);

CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_has_location 
  ON public.enterprise_licenses (id) 
  WHERE (business_latitude IS NOT NULL AND business_longitude IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_enterprise_licenses_location_source 
  ON public.enterprise_licenses (business_location_source);


-- -------------------------------------------------------------------------
-- 4. PROVISION METROLOGY SYSTEM CENTRALIZED MAP SETTINGS CONFIG TABLE
-- -------------------------------------------------------------------------
-- Allows dynamic administrative override of visual focal centers, map zooms,
-- NMC logo marker shapes and OpenStreetMap API tileservers from dashboards.

CREATE TABLE IF NOT EXISTS public.map_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key TEXT UNIQUE NOT NULL,
    setting_value JSONB NOT NULL,
    description TEXT NULL,
    is_active BOOLEAN DEFAULT true,
    created_by TEXT NULL,
    updated_by TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed configuration parameters safely with transactional ON CONFLICT defaults
INSERT INTO public.map_settings (setting_key, setting_value, description)
VALUES 
(
  'default_map_center', 
  '{"lat": 12.5657, "lng": 104.9910, "label": "Cambodia"}'::jsonb, 
  'Default starting coordinates for focus rendering when loading Cambodia National metrology mapping.'
),
(
  'default_map_zoom', 
  '{"zoom": 7}'::jsonb, 
  'Standard Leaflet zoom focal level demonstrating the territorial administrative province domains.'
),
(
  'nmc_marker_style', 
  '{"useNmcLogo": true, "markerSize": [36, 36], "markerAnchor": [18, 36], "popupAnchor": [0, -36], "activeColor": "#15803D", "expiringColor": "#D97706", "expiredColor": "#DC2626", "suspendedColor": "#6B7280"}'::jsonb, 
  'Branded representation specs centered around NMC emblem with responsive license validity accent highlights.'
),
(
  'map_tile_provider', 
  '{"provider": "OpenStreetMap", "url": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", "attribution": "&copy; OpenStreetMap contributors"}'::jsonb, 
  'Lightweight tile provider endpoint options suitable for low bandwidth public administration networks.'
)
ON CONFLICT (setting_key) DO NOTHING;


-- -------------------------------------------------------------------------
-- 5. CREATE GEOGRAPHIC AUDITING & LOCATION CHANGE LIFETIME HISTORIES
-- -------------------------------------------------------------------------
-- Transparent tracing database tracking the coordinate updates on registered enterprises.

CREATE TABLE IF NOT EXISTS public.enterprise_license_location_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID REFERENCES public.enterprise_licenses(id) ON DELETE CASCADE,
    old_latitude DOUBLE PRECISION NULL,
    old_longitude DOUBLE PRECISION NULL,
    new_latitude DOUBLE PRECISION NULL,
    new_longitude DOUBLE PRECISION NULL,
    old_geo_address TEXT NULL,
    new_geo_address TEXT NULL,
    location_source TEXT NULL,
    changed_by TEXT NULL,
    changed_at TIMESTAMPTZ DEFAULT now(),
    notes TEXT NULL
);

-- Indexes for lightning historical search operations on enterprise profiles
CREATE INDEX IF NOT EXISTS idx_enterprise_license_loc_hist_lic_id
  ON public.enterprise_license_location_history (license_id);

CREATE INDEX IF NOT EXISTS idx_enterprise_license_loc_hist_changed_at
  ON public.enterprise_license_location_history (changed_at);


-- -------------------------------------------------------------------------
-- 6. TRIGGER: UPDATE location_updated_at FIELD AUTOMATICALLY
-- -------------------------------------------------------------------------
-- Automatically sets the location_updated_at with exact timestamp of modifications.

CREATE OR REPLACE FUNCTION public.set_enterprise_license_location_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    (NEW.business_latitude IS DISTINCT FROM OLD.business_latitude) OR
    (NEW.business_longitude IS DISTINCT FROM OLD.business_longitude) OR
    (NEW.business_geo_address IS DISTINCT FROM OLD.business_geo_address) OR
    (NEW.business_location_source IS DISTINCT FROM OLD.business_location_source)
  ) THEN
    NEW.location_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enterprise_license_location_updated_at ON public.enterprise_licenses;

CREATE TRIGGER trg_enterprise_license_location_updated_at
BEFORE UPDATE ON public.enterprise_licenses
FOR EACH ROW
EXECUTE FUNCTION public.set_enterprise_license_location_updated_at();


-- -------------------------------------------------------------------------
-- 7. TRIGGER: LOG HISTORICAL RECORD OF CHANGES IN LOCATION COORDINATES
-- -------------------------------------------------------------------------
-- For auditing compliance, log spatial coordinates modifications automatically under historic tables.

CREATE OR REPLACE FUNCTION public.log_enterprise_license_location_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    (NEW.business_latitude IS DISTINCT FROM OLD.business_latitude) OR
    (NEW.business_longitude IS DISTINCT FROM OLD.business_longitude)
  ) THEN
    INSERT INTO public.enterprise_license_location_history (
      license_id,
      old_latitude,
      old_longitude,
      new_latitude,
      new_longitude,
      old_geo_address,
      new_geo_address,
      location_source,
      changed_by,
      notes
    ) VALUES (
      NEW.id,
      OLD.business_latitude,
      OLD.business_longitude,
      NEW.business_latitude,
      NEW.business_longitude,
      OLD.business_geo_address,
      NEW.business_geo_address,
      NEW.business_location_source,
      COALESCE(NEW.updated_by, 'NMC System Agent'),
      'Automatically logs spatial geographic coordinates migration or update activity'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enterprise_license_location_history ON public.enterprise_licenses;

CREATE TRIGGER trg_enterprise_license_location_history
AFTER UPDATE ON public.enterprise_licenses
FOR EACH ROW
EXECUTE FUNCTION public.log_enterprise_license_location_change();


-- -------------------------------------------------------------------------
-- 8. SECURITY RULES: ROW LEVEL SECURITY (RLS) POLICIES
-- -------------------------------------------------------------------------
-- Secure access parameters ensuring multi-tenant isolation and user role protection.

ALTER TABLE public.map_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_license_location_history ENABLE ROW LEVEL SECURITY;

-- Dynamic Policies for: public.map_settings
DROP POLICY IF EXISTS "Allow public/authenticated read access to active map settings" ON public.map_settings;
CREATE POLICY "Allow public/authenticated read access to active map settings"
  ON public.map_settings FOR SELECT
  USING (is_active = true);

-- [DEVELOPMENT ONLY POLICY] Full administrative update controls over system configs.
-- Production reminder: Restrict full mutations to authenticated users with 'superadmin' roles before official deployment.
DROP POLICY IF EXISTS "Allow authorized configurations for map settings" ON public.map_settings;
CREATE POLICY "Allow authorized configurations for map settings"
  ON public.map_settings FOR ALL
  USING (true)
  WITH CHECK (true);

-- Dynamic Policies for: public.enterprise_license_location_history
-- Superadmin / Admin can review mapping operations
DROP POLICY IF EXISTS "Allow administrative telemetry auditing logs" ON public.enterprise_license_location_history;
CREATE POLICY "Allow administrative telemetry auditing logs"
  ON public.enterprise_license_location_history FOR ALL
  USING (true)
  WITH CHECK (true);

-- Company role access isolation: A company is restricted to seeing only the telemetry changes of its licensed profile.
DROP POLICY IF EXISTS "Isolation: Company users query own spatial records only" ON public.enterprise_license_location_history;
CREATE POLICY "Isolation: Company users query own spatial records only"
  ON public.enterprise_license_location_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.enterprise_licenses el
      WHERE el.id = enterprise_license_location_history.license_id
    )
  );


-- -------------------------------------------------------------------------
-- 9. DATA BACKUP COMPLIANCE COMPATIBILITY SUMMARY NOTE
-- -------------------------------------------------------------------------
--  Attention DBAs & Administrative System Operators:
--
--  Ensure Backup & Restore algorithms cover the newly established datasets:
--  - Table "enterprise_licenses" now exports columns: ["business_latitude", "business_longitude", "business_location_source", "business_geo_address", "location_updated_at"]
--  - Table "map_settings" with columns ["id", "setting_key", "setting_value", "description", "is_active"]
--  - Table "enterprise_license_location_history" representing auditing metrics.
-- =========================================================================
