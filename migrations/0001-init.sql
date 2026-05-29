-- 0001-init: baseline schema.
-- Keep minimal: the migration bookkeeping table is created by the runner
-- itself; this baseline only adds a generic key/value meta table that later
-- connector/inbox epics build on. No domain tables yet (sessions + audit are
-- file-based per #39/#38).

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
