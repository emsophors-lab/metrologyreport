-- Additive local/server migration. No operational report changes.
CREATE TABLE IF NOT EXISTS ml_lifecycle (
  id VARCHAR(36) PRIMARY KEY,
  revision BIGINT NOT NULL DEFAULT 0,
  payload JSON NOT NULL
);
INSERT IGNORE INTO ml_lifecycle(id, payload) VALUES ('main', JSON_OBJECT());
