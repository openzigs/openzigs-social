-- 0005-inbox-rule-engine: unified inbox read model + comment rule engine (epic #71).
--
-- This epic OWNS the inbox read/aggregation layer and the rule engine. It does
-- NOT re-create any inbound persistence — contacts/threads/messages are written
-- by the connectors via SocialBrain (migration 0002). Here we add only:
--
--   * inbox_rules         (#74) — declarative, NON-executable rule definitions.
--                                 Conditions/actions are stored as JSON structs
--                                 evaluated by a typed engine (no eval / no code).
--   * inbox_rule_firings  (#74) — append-only audit trail: one row every time a
--                                 rule matches a message and applies its actions.
--   * inbox_thread_state  (#76) — per-thread read cursor + priority/flag derived
--                                 by the rule engine, used for unread counts and
--                                 priority sorting in the inbox.
--   * social_messages_fts (#77) — FTS5 full-text index over message bodies, kept
--                                 in sync with social_messages by triggers, for
--                                 the inbox search box.
--
-- Single transaction (the runner wraps it). No ad-hoc ALTER anywhere; all reads
-- and writes against these tables use parameterized prepared statements.

-- ---------------------------------------------------------------------------
-- Comment / message rule definitions (#74)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inbox_rules (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  enabled        INTEGER NOT NULL DEFAULT 1,
  -- Lower sort_order runs first. Ties broken by id (insertion order).
  sort_order     INTEGER NOT NULL DEFAULT 0,
  -- Declarative condition tree (see src/inbox/rules/types.ts). NEVER code.
  condition_json TEXT NOT NULL,
  -- Declarative action bag: priority / tags / route / flag.
  actions_json   TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inbox_rules_enabled_order
  ON inbox_rules(enabled, sort_order, id);

-- ---------------------------------------------------------------------------
-- Rule firing audit trail (#74) — append-only, never updated.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inbox_rule_firings (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id             INTEGER NOT NULL REFERENCES inbox_rules(id) ON DELETE CASCADE,
  -- The message the rule fired against (platform-native coordinates so the
  -- audit row survives even if the message row is later pruned).
  platform            TEXT NOT NULL,
  platform_message_id TEXT NOT NULL,
  -- SocialBrain message id at firing time, when known.
  message_id          INTEGER,
  -- Snapshot of the actions actually applied by this firing.
  actions_json        TEXT NOT NULL,
  fired_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inbox_rule_firings_rule
  ON inbox_rule_firings(rule_id, fired_at);
CREATE INDEX IF NOT EXISTS idx_inbox_rule_firings_message
  ON inbox_rule_firings(platform, platform_message_id);

-- ---------------------------------------------------------------------------
-- Per-thread inbox state (#76): read cursor + rule-derived priority/flag.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inbox_thread_state (
  thread_id    INTEGER PRIMARY KEY REFERENCES social_threads(id) ON DELETE CASCADE,
  -- 'low' | 'normal' | 'high' | 'urgent' — drives priority sorting.
  priority     TEXT NOT NULL DEFAULT 'normal',
  flagged      INTEGER NOT NULL DEFAULT 0,
  -- Newest message timestamp the user has seen; unread = messages after this.
  last_read_at TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Full-text search index over message bodies (#77).
--
-- External-content FTS5 table mirroring social_messages. Triggers keep it in
-- sync on every insert/update/delete so the connectors' SocialBrain upserts
-- transparently maintain the index without knowing it exists. Search queries
-- bind the (escaped) MATCH expression as a parameter — never string-built SQL.
-- ---------------------------------------------------------------------------

CREATE VIRTUAL TABLE IF NOT EXISTS social_messages_fts USING fts5(
  body,
  content='social_messages',
  content_rowid='id'
);

-- Backfill any rows that already exist (no-op on a fresh DB).
INSERT INTO social_messages_fts(rowid, body)
  SELECT id, body FROM social_messages
  WHERE id NOT IN (SELECT rowid FROM social_messages_fts);

CREATE TRIGGER IF NOT EXISTS social_messages_fts_ai
AFTER INSERT ON social_messages BEGIN
  INSERT INTO social_messages_fts(rowid, body) VALUES (new.id, new.body);
END;

CREATE TRIGGER IF NOT EXISTS social_messages_fts_ad
AFTER DELETE ON social_messages BEGIN
  INSERT INTO social_messages_fts(social_messages_fts, rowid, body)
    VALUES ('delete', old.id, old.body);
END;

CREATE TRIGGER IF NOT EXISTS social_messages_fts_au
AFTER UPDATE ON social_messages BEGIN
  INSERT INTO social_messages_fts(social_messages_fts, rowid, body)
    VALUES ('delete', old.id, old.body);
  INSERT INTO social_messages_fts(rowid, body) VALUES (new.id, new.body);
END;
