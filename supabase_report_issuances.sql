-- Additive migration. Apply to production only with the owner's approval.
BEGIN;
CREATE TABLE IF NOT EXISTS public.report_issuances (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  artifact_sha256 text NOT NULL CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  report_kind text NOT NULL,
  file_format text NOT NULL CHECK (file_format IN ('docx','pdf','xlsx','html','pptx')),
  title text NOT NULL,
  company_name text NOT NULL DEFAULT '',
  licence_no text NOT NULL DEFAULT '',
  period_label text NOT NULL DEFAULT '',
  issued_at timestamptz NOT NULL,
  issued_by text NOT NULL,
  state text NOT NULL CHECK (state IN ('issued','revoked')),
  basis text NOT NULL CHECK (basis IN ('database','staff-prepared','draft')),
  source_snapshot jsonb NOT NULL
);
ALTER TABLE public.report_issuances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_issuances FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.report_issuances TO service_role;
CREATE INDEX IF NOT EXISTS report_issuances_issued_at_idx ON public.report_issuances(issued_at);
COMMIT;
