-- =====================================================================
--  ANNEX 8 — PRIVATE STORAGE BUCKET FOR OFFICIAL DOCUMENTS
--
--  Run AFTER supabase_annex8_official_documents.sql.
--
--  The official DOCX/PDF of a submitted report are generated once at
--  submission and kept in a PRIVATE bucket. Nothing is served from a
--  public storage URL: every download goes through
--      GET /api/reports/:id/annex8.docx
--      GET /api/reports/:id/annex8.pdf
--  which checks that the caller is the owner licensee or NMC staff
--  before streaming the stored bytes.
--
--  Object path:  <licence_no>/<YYYY-MM>/<report_id>/<file name>
--  Override the bucket name with the ANNEX8_BUCKET env var if you
--  create it under a different name.
-- =====================================================================

-- ---------------------------------------------------------------------
--  PORTABILITY
--
--  storage.* exists only on Supabase. On a self-hosted Postgres (the
--  planned move to MISTI's internal server) this whole block is skipped
--  and the server keeps the documents on disk or on S3 instead — see
--  ANNEX8_STORAGE_DRIVER in docs/database-portability.md. Everything
--  else in this file is standard PostgreSQL and runs unchanged.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    RAISE NOTICE 'No storage schema: not a Supabase database. Skipping bucket creation — set ANNEX8_STORAGE_DRIVER=fs or s3.';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'annex8-reports',
    'annex8-reports',
    FALSE,                       -- private: no public URL, ever
    52428800,                    -- 50 MB; a 40-instrument annex is well under 2 MB
    ARRAY[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  )
  ON CONFLICT (id) DO UPDATE
    SET public = FALSE,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

  -- No policies are granted to anon or authenticated. Reads and writes happen
  -- only with the service-role key from server.ts, which bypasses RLS, so the
  -- API's own owner-or-NMC-staff check is the single gate on these files.
  -- Dropping any policy an earlier run may have added keeps that true.
  DROP POLICY IF EXISTS "annex8_reports_public_read"        ON storage.objects;
  DROP POLICY IF EXISTS "annex8_reports_authenticated_read" ON storage.objects;
END $$;

-- Columns used by the storage wiring were added in
-- supabase_annex8_official_documents.sql (official_docx_path,
-- official_pdf_path, the two checksums, official_rendered_at,
-- official_render_error). Repeated here as IF NOT EXISTS so this file can be
-- run on a database that only ever received the base Annex 8 schema.
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_docx_path    TEXT;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_pdf_path     TEXT;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_docx_sha256  TEXT;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_pdf_sha256   TEXT;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_rendered_at  TIMESTAMPTZ;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_render_error TEXT;

COMMENT ON COLUMN annex8_reports.official_pdf_path IS
  'Object path inside the private annex8-reports bucket. Never a public URL.';
