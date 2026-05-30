-- 0006-inbox-firings-retain: retain rule-firing audit rows on rule deletion (epic #71 follow-up).
--
-- Migration 0005 declared `inbox_rule_firings.rule_id` as
--   INTEGER NOT NULL REFERENCES inbox_rules(id) ON DELETE CASCADE
-- which meant deleting a rule WIPED its entire firing history — directly
-- contradicting the "append-only audit trail" guarantee. A firing records what
-- happened to a message at a point in time; it must survive the deletion of the
-- rule that produced it.
--
-- This migration rebuilds `inbox_rule_firings` so `rule_id` is NULLABLE with
--   ON DELETE SET NULL
-- preserving every existing row. When a parent rule is deleted the firing
-- remains and its `rule_id` becomes NULL (a "deleted-rule firing" that is still
-- readable by message coordinates). NEVER edit migrations 0001–0005; this is a
-- new numbered file. The migration runner wraps this in its own transaction and
-- records version 6 in schema_migrations.
--
-- Standard SQLite table-rebuild pattern (no ad-hoc ALTER of the column): build a
-- corrected table, copy existing rows verbatim, drop the old table, rename, and
-- recreate the two indexes. `inbox_rule_firings` is not referenced by any other
-- table, so the drop/rename is safe even with foreign_keys=ON.

CREATE TABLE inbox_rule_firings_new (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Nullable now: a firing outlives its rule. ON DELETE SET NULL keeps the audit
  -- row but clears the dangling reference once the rule is removed.
  rule_id             INTEGER REFERENCES inbox_rules(id) ON DELETE SET NULL,
  platform            TEXT NOT NULL,
  platform_message_id TEXT NOT NULL,
  message_id          INTEGER,
  actions_json        TEXT NOT NULL,
  fired_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO inbox_rule_firings_new
  (id, rule_id, platform, platform_message_id, message_id, actions_json, fired_at)
  SELECT id, rule_id, platform, platform_message_id, message_id, actions_json, fired_at
  FROM inbox_rule_firings;

DROP TABLE inbox_rule_firings;

ALTER TABLE inbox_rule_firings_new RENAME TO inbox_rule_firings;

CREATE INDEX IF NOT EXISTS idx_inbox_rule_firings_rule
  ON inbox_rule_firings(rule_id, fired_at);
CREATE INDEX IF NOT EXISTS idx_inbox_rule_firings_message
  ON inbox_rule_firings(platform, platform_message_id);
