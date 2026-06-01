-- 0010-analytics: analytics rollup cache for the dashboard + digest (epic #95).
--
-- The analytics layer (#96 aggregator) reads the shared `platform_insights_raw`
-- store (0003) joined to published `outbox` rows (0007) and persists rolled-up,
-- read-optimised snapshots HERE. The dashboard (#97/#98) and the weekly digest
-- (#99) read ONLY these cache tables — never the raw store, never a live API —
-- so a platform filter re-renders from already-cached rows in well under the
-- 200ms target.
--
-- Idempotency: the daily aggregator UPSERTs each snapshot keyed by its capture
-- day, so re-running the aggregator on the same day overwrites the day's row in
-- place rather than inflating the table (mirrors the raw store's contract).
--
-- Single transaction (the runner wraps it). No ad-hoc ALTER anywhere; this is a
-- new numbered file recorded as version 10 in schema_migrations. NEVER edit
-- migrations 0001-0009. (0009 is reserved for the CRM epic on its own branch.)

-- Trailing-window engagement rollups: one row per
-- (platform, window_days, metric, captured_for-day). `window_days` is 7/30/90.
-- `metric` is a normalised aggregate name ('engagement','posts','impressions').
CREATE TABLE IF NOT EXISTS analytics_rollup (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  platform      TEXT NOT NULL,
  -- Trailing window in days the metric was summed over (7, 30, or 90).
  window_days   INTEGER NOT NULL,
  -- Normalised aggregate metric name (cross-platform), e.g. 'engagement'.
  metric        TEXT NOT NULL,
  value         REAL NOT NULL DEFAULT 0,
  -- The day the aggregator captured this snapshot (YYYY-MM-DD).
  captured_for  TEXT NOT NULL,
  captured_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (platform, window_days, metric, captured_for)
);

CREATE INDEX IF NOT EXISTS idx_analytics_rollup_lookup
  ON analytics_rollup(platform, window_days, metric);

CREATE INDEX IF NOT EXISTS idx_analytics_rollup_day
  ON analytics_rollup(captured_for);

-- Posting-time heatmap buckets: one row per
-- (platform, day_of_week, hour_of_day, captured_for-day). day_of_week is 0-6
-- (0 = Sunday), hour_of_day is 0-23, both in the configured local timezone.
CREATE TABLE IF NOT EXISTS analytics_heatmap (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  platform      TEXT NOT NULL,
  -- 0 (Sunday) .. 6 (Saturday) in the configured analytics timezone.
  day_of_week   INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  -- 0 .. 23 in the configured analytics timezone.
  hour_of_day   INTEGER NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  post_count    INTEGER NOT NULL DEFAULT 0,
  captured_for  TEXT NOT NULL,
  captured_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (platform, day_of_week, hour_of_day, captured_for)
);

CREATE INDEX IF NOT EXISTS idx_analytics_heatmap_lookup
  ON analytics_heatmap(platform, captured_for);

-- Top posts by engagement per trailing window: one row per
-- (platform, window_days, external_id, captured_for-day). `rank` is 1-based.
CREATE TABLE IF NOT EXISTS analytics_top_posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  platform      TEXT NOT NULL,
  window_days   INTEGER NOT NULL,
  -- Platform-native id of the published post (joins outbox.external_id).
  external_id   TEXT NOT NULL,
  engagement    REAL NOT NULL DEFAULT 0,
  -- Epoch ms the post was published (from outbox.published_at).
  published_at  INTEGER,
  -- 1-based rank within the (platform, window_days) leaderboard.
  rank          INTEGER NOT NULL,
  captured_for  TEXT NOT NULL,
  captured_at   TEXT NOT NULL DEFAULT (datetime('now')),
  metadata_json TEXT,
  UNIQUE (platform, window_days, external_id, captured_for)
);

CREATE INDEX IF NOT EXISTS idx_analytics_top_posts_lookup
  ON analytics_top_posts(platform, window_days, captured_for, rank);
