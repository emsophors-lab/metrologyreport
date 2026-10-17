-- =====================================================================
--  ANNEX 8 — OFFICIAL DOCUMENT RENDERING
--
--  Run AFTER supabase_annex8_schema.sql.
--
--  The official record of a submitted report is the DOCX produced by
--  filling templates/Annex8_template_v1.docx, and the PDF converted from
--  it. Both are generated once at submission and served unchanged
--  afterwards, so a report can never silently re-render differently from
--  what the licensee signed and NMC received.
-- =====================================================================

-- Which template filled this report. Old reports must keep rendering with
-- the template version they were submitted under, even after v2 lands.
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS template_version TEXT NOT NULL DEFAULT 'v1';

-- Stored official documents. Paths point at the storage bucket; the
-- checksum lets us prove the served file is the one generated at submit.
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_docx_path   TEXT;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_pdf_path    TEXT;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_docx_sha256 TEXT;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_pdf_sha256  TEXT;
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_rendered_at TIMESTAMPTZ;
-- Set when PDF conversion failed at submit, so a retry can find it.
ALTER TABLE annex8_reports ADD COLUMN IF NOT EXISTS official_render_error TEXT;

CREATE INDEX IF NOT EXISTS idx_a8_reports_template_version
  ON annex8_reports (template_version);
CREATE INDEX IF NOT EXISTS idx_a8_reports_render_pending
  ON annex8_reports (id) WHERE official_pdf_path IS NULL AND status <> 'DRAFT';

-- Licence fields the cover letter needs that the licence record does not
-- carry yet. decision_no / decision_date already exist in
-- annex8_licence_profiles; the legal representative signs the declaration.
ALTER TABLE annex8_licence_profiles ADD COLUMN IF NOT EXISTS legal_rep_name     TEXT;
ALTER TABLE annex8_licence_profiles ADD COLUMN IF NOT EXISTS legal_rep_position TEXT;

COMMENT ON COLUMN annex8_reports.template_version IS
  'Template used to render this report. Render old reports with their own version.';
COMMENT ON COLUMN annex8_reports.official_pdf_sha256 IS
  'Checksum of the PDF generated at submission; the served file must match.';
