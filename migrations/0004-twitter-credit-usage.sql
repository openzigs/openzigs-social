-- 0004-twitter-credit-usage: X (Twitter) write-quota usage ledger (epic #66
-- Cohort C, sub #69).
--
-- The X v2 API meters paid *write* actions (create tweet, reply, send DM)
-- against a monthly per-tier budget (Free 1.5k / Basic 50k / Pro 1M). Unlike
-- short-window rate limits — which the RateLimitBroker token bucket handles —
-- this is a slow, monthly-resetting credit pool the user must not blow through
-- unknowingly. We record every billable write here so the quota guard (#70)
-- can compare month-to-date usage against the tier cap, warn at the configured
-- threshold (default 80%), and hard-block at 100%.
--
-- `usage_month` is the UTC 'YYYY-MM' bucket the write counts against, so a
-- simple SUM(amount) WHERE usage_month = ? gives month-to-date consumption and
-- the pool resets naturally when the month rolls over (no cron needed).
--
-- Idempotency: each billable action carries a connector-supplied dedupe key
-- (e.g. the returned tweet/DM id, or a deterministic client token for the
-- attempt). The UNIQUE constraint makes a re-recorded action a no-op so a retry
-- or re-poll never double-counts.
--
-- Single transaction (the runner wraps it). No ad-hoc ALTER anywhere.

CREATE TABLE IF NOT EXISTS twitter_credit_usage (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  -- UTC month bucket the usage counts against, 'YYYY-MM'.
  usage_month  TEXT NOT NULL,
  -- billable action kind: 'tweet' | 'reply' | 'dm'.
  kind         TEXT NOT NULL,
  -- write credits consumed (normally 1 per action).
  amount       INTEGER NOT NULL DEFAULT 1,
  -- connector-supplied idempotency key (tweet/DM id or client token).
  dedupe_key   TEXT NOT NULL,
  recorded_at  TEXT NOT NULL DEFAULT (datetime('now')),
  metadata_json TEXT,
  UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_twitter_credit_month
  ON twitter_credit_usage(usage_month);

CREATE INDEX IF NOT EXISTS idx_twitter_credit_month_kind
  ON twitter_credit_usage(usage_month, kind);
