-- 0003-meta-insights: raw social insights store (epic #53 Cohort A, shared #96).
--
-- Connectors poll platform analytics (Threads media insights #137, Facebook
-- Page/post insights #57, …) and land each metric reading here verbatim. The
-- analytics/reporting layer (#96) reads from this normalised store rather than
-- each connector inventing its own table.
--
-- Idempotency: re-polling the same metric for the same object + capture window
-- is a no-op via the UNIQUE constraint, so a poller can run as often as it
-- likes without inflating rows. Numeric values are stored as REAL; richer
-- payloads (breakdowns, dimensions) go in metadata_json.
--
-- Single transaction (the runner wraps it). No ad-hoc ALTER anywhere.

CREATE TABLE IF NOT EXISTS platform_insights_raw (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  platform      TEXT NOT NULL,
  -- e.g. 'account', 'post', 'media', 'page'.
  object_type   TEXT NOT NULL,
  -- platform-native id of the object the metric belongs to.
  object_id     TEXT NOT NULL,
  -- metric name as reported by the platform, e.g. 'views', 'likes'.
  metric        TEXT NOT NULL,
  value         REAL,
  -- the window the metric describes (platform 'end_time' or our capture key).
  captured_for  TEXT NOT NULL,
  captured_at   TEXT NOT NULL DEFAULT (datetime('now')),
  metadata_json TEXT,
  UNIQUE (platform, object_type, object_id, metric, captured_for)
);

CREATE INDEX IF NOT EXISTS idx_platform_insights_object
  ON platform_insights_raw(platform, object_type, object_id);

CREATE INDEX IF NOT EXISTS idx_platform_insights_metric
  ON platform_insights_raw(platform, metric);
