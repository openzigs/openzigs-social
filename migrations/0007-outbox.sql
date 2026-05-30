-- 0007-outbox: outbox state machine for scheduled publishing (epic #84, #85/#86).
--
-- The outbox is the single queue the composer writes into and the node-cron
-- poller (#86) drains. A row walks a strict five-state machine enforced in the
-- repository (illegal transitions rejected):
--
--   draft → scheduled → publishing → published
--                            └──────→ failed
--
-- `publish_at` (epoch ms) is the due time the poller compares against. The
-- poller claims a due row by an atomic conditional UPDATE scheduled→publishing
-- so two overlapping ticks can never double-publish the same post. Terminal
-- publish failures land in `outbox_dlq` (already created in 0002) — this
-- migration adds NO second DLQ.
--
-- Single transaction (the runner wraps it). No ad-hoc ALTER anywhere; this is a
-- new numbered file recorded as version 7 in schema_migrations. NEVER edit
-- migrations 0001–0006.

CREATE TABLE IF NOT EXISTS outbox (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Target platform key (e.g. 'twitter', 'linkedin'); drives publisher dispatch.
  platform      TEXT NOT NULL,
  -- Optional target account/page reference for platforms with multiple targets.
  account_id    TEXT,
  -- Post text. May be empty for media-only posts; per-platform limits are
  -- enforced in the repository + router, never in SQL.
  body          TEXT NOT NULL DEFAULT '',
  -- JSON array of media refs: [{ "url": "...", "type": "image/png",
  -- "altText": "..." }]. NULL when there is no media.
  media_json    TEXT,
  -- Five-state machine, CHECK-constrained so an invalid status can never be
  -- written even by a future bug.
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','scheduled','publishing','published','failed')),
  -- Scheduled publish time (epoch ms). NULL for plain drafts not yet scheduled.
  publish_at    INTEGER,
  -- Platform-native id of the published post, once published.
  external_id   TEXT,
  -- How many publish attempts have been spent (retry bookkeeping).
  attempts      INTEGER NOT NULL DEFAULT 0,
  -- Last failure message surfaced to the UI on a failed row.
  last_error    TEXT,
  -- Epoch ms the row reached 'published'.
  published_at  INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- The poller's hot path: "due scheduled rows" — status + publish_at together.
CREATE INDEX IF NOT EXISTS idx_outbox_due
  ON outbox(status, publish_at);

-- Status-only filter for the calendar / outbox list views.
CREATE INDEX IF NOT EXISTS idx_outbox_status
  ON outbox(status);
