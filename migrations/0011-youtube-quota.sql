-- 0011-youtube-quota: YouTube Data API v3 daily quota ledger (epic #58).
--
-- YouTube's Data API v3 meters every call against a shared 10,000-unit daily
-- budget that resets at midnight UTC. Unlike the Twitter monthly credit pool,
-- this is a *daily* counter: 1 unit per read call (list/search), 50 units per
-- write call (commentThread.insert / comments.insert).
--
-- The table is keyed by `day_utc` (UTC date 'YYYY-MM-DD') so a simple
-- SELECT quota_units WHERE day_utc = ? gives today's total. Upserts use
-- ON CONFLICT to accumulate units atomically — a retry never double-counts.
--
-- Single transaction (the runner wraps it). No ad-hoc ALTER anywhere.

CREATE TABLE IF NOT EXISTS youtube_quota_usage (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  -- UTC date bucket 'YYYY-MM-DD' the units count against.
  day_utc     TEXT NOT NULL,
  -- Cumulative units recorded for this day.
  quota_units INTEGER NOT NULL DEFAULT 0,
  UNIQUE (day_utc)
);

CREATE INDEX IF NOT EXISTS idx_youtube_quota_day
  ON youtube_quota_usage(day_utc);
