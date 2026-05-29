-- 0002-platform-service: cross-cutting platform service layer (epic #127).
--
-- Adds the persistence the connector epics (Cohort A/B/C), the unified inbox,
-- the auto-reply pipeline, the outbox, and the DM dispatcher all share:
--   * SocialBrain inbound store (#143): social_contacts, social_threads,
--     social_messages — idempotent on platform-native ids.
--   * Webhook dedupe ledger (#140): webhook_events — one row per delivered
--     event so replays are no-ops.
--   * Dead-letter queue (#142): outbox_dlq — terminally-failed outbound ops.
--
-- Single transaction (the runner wraps it). No ad-hoc ALTER anywhere.

-- ---------------------------------------------------------------------------
-- SocialBrain — inbound social persistence (#143)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS social_contacts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  platform            TEXT NOT NULL,
  platform_contact_id TEXT NOT NULL,
  handle              TEXT,
  display_name        TEXT,
  avatar_url          TEXT,
  metadata_json       TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (platform, platform_contact_id)
);

CREATE TABLE IF NOT EXISTS social_threads (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  platform           TEXT NOT NULL,
  platform_thread_id TEXT NOT NULL,
  contact_id         INTEGER REFERENCES social_contacts(id) ON DELETE SET NULL,
  subject            TEXT,
  last_message_at    TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (platform, platform_thread_id)
);

CREATE INDEX IF NOT EXISTS idx_social_threads_contact
  ON social_threads(contact_id);

CREATE TABLE IF NOT EXISTS social_messages (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  platform            TEXT NOT NULL,
  platform_message_id TEXT NOT NULL,
  thread_id           INTEGER REFERENCES social_threads(id) ON DELETE CASCADE,
  contact_id          INTEGER REFERENCES social_contacts(id) ON DELETE SET NULL,
  -- 'inbound' (received) or 'outbound' (sent by us).
  direction           TEXT NOT NULL DEFAULT 'inbound',
  body                TEXT NOT NULL,
  metadata_json       TEXT,
  sent_at             TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (platform, platform_message_id)
);

CREATE INDEX IF NOT EXISTS idx_social_messages_thread
  ON social_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_social_messages_contact
  ON social_messages(contact_id);

-- ---------------------------------------------------------------------------
-- Webhook dedupe ledger (#140)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS webhook_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  platform    TEXT NOT NULL,
  event_id    TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (platform, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_received
  ON webhook_events(received_at);

-- ---------------------------------------------------------------------------
-- Dead-letter queue for terminally-failed outbound ops (#142)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS outbox_dlq (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  platform     TEXT NOT NULL,
  op_kind      TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  last_error   TEXT NOT NULL,
  attempts     INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_outbox_dlq_platform
  ON outbox_dlq(platform);
