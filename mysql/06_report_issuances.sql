-- Additive migration for an existing local MySQL database. No operational rows change.
CREATE TABLE IF NOT EXISTS report_issuances (
  id CHAR(36) PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  artifact_sha256 CHAR(64) NOT NULL,
  source_sha256 CHAR(64) NOT NULL,
  report_kind VARCHAR(64) NOT NULL,
  file_format VARCHAR(8) NOT NULL,
  title VARCHAR(500) NOT NULL,
  company_name VARCHAR(500) NOT NULL DEFAULT '',
  licence_no VARCHAR(190) NOT NULL DEFAULT '',
  period_label VARCHAR(190) NOT NULL DEFAULT '',
  issued_at DATETIME(3) NOT NULL,
  issued_by VARCHAR(190) NOT NULL,
  state VARCHAR(16) NOT NULL,
  basis VARCHAR(32) NOT NULL,
  source_snapshot JSON NOT NULL,
  CHECK (file_format IN ('docx','pdf','xlsx','html','pptx')),
  CHECK (state IN ('issued','revoked')),
  CHECK (basis IN ('database','staff-prepared','draft')),
  INDEX report_issuances_issued_at_idx(issued_at)
) ENGINE=InnoDB;
