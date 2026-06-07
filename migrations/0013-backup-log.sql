-- Backup audit log: records every export and import for non-repudiation.
-- Never stores passphrase material or key material — only direction + timestamp.

CREATE TABLE IF NOT EXISTS backup_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  direction  TEXT    NOT NULL CHECK (direction IN ('export', 'import')),
  created_at TEXT    NOT NULL,
  note       TEXT
);
