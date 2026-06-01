-- 0008-auto-reply-audit: brand-voice rulebook + auto-reply audit trail (epic #78).
--
-- This single numbered migration backs the whole "AI auto-reply with brand
-- voice" epic and creates TWO tables:
--
--   1. brand_voice_rulebook — the single-row, one-voice-per-workspace rulebook
--      the Linguistic Profiler (#79) scores drafts against: a tone descriptor,
--      a banned-words list, and a set of exemplar posts. v1 drops openzigs'
--      multi-personality system: exactly one row (id = 1) ever exists, upserted
--      in place.
--
--   2. auto_reply_audit — one row per auto-reply decision (#82). Every draft the
--      Hybrid posture (#81) evaluates is recorded with its prompt, draft text,
--      both scores (confidence + voice match), the routing decision, and the
--      final outcome once an approval resolves. Rows are queryable by thread and
--      by time range to back the per-thread decision-log panel, and carry a
--      nullable contact_id so the GDPR right-to-delete cascade (#138) can purge
--      a contact's audit history at the repository boundary.
--
-- Single transaction (the runner wraps it). No ad-hoc ALTER anywhere; this is a
-- new numbered file recorded as version 8 in schema_migrations. NEVER edit
-- migrations 0001–0007.

CREATE TABLE IF NOT EXISTS brand_voice_rulebook (
  -- Always 1. A CHECK pins the table to a single workspace-wide voice so an
  -- accidental second insert is rejected rather than silently shadowing the
  -- rulebook the profiler reads.
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  -- Free-text tone descriptor, e.g. "warm, concise, lightly playful". The
  -- profiler tokenises this into the target tone signal.
  tone          TEXT NOT NULL DEFAULT '',
  -- JSON array of lowercase banned words/phrases: ["spam","guarantee"]. Any hit
  -- vetoes a draft's voice score to 0 (forces the approval queue).
  banned_words_json TEXT NOT NULL DEFAULT '[]',
  -- JSON array of exemplar posts that define the house voice. The profiler
  -- compares a draft's lexical fingerprint against these.
  exemplars_json TEXT NOT NULL DEFAULT '[]',
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auto_reply_audit (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Conversation/thread the reply belongs to. Indexed for the decision-log panel.
  thread_id     TEXT NOT NULL,
  -- Nullable owning contact, so the #138 right-to-delete cascade can purge a
  -- contact's audit rows. NULL when the reply is not tied to a known contact.
  contact_id    TEXT,
  -- Target platform key (e.g. 'twitter', 'linkedin').
  platform      TEXT NOT NULL DEFAULT '',
  -- The incoming message / prompt the draft was generated for.
  prompt        TEXT NOT NULL DEFAULT '',
  -- The model-generated draft as scored.
  draft_text    TEXT NOT NULL DEFAULT '',
  -- The text actually sent. NULL until an outcome resolves; may differ from the
  -- draft when a human edits a queued reply before approving (human_override).
  final_text    TEXT,
  -- Model self-/logprob-derived confidence in [0,1].
  confidence    REAL NOT NULL DEFAULT 0,
  -- Linguistic Profiler voice match in [0,1] (banned-word veto clamps to 0).
  voice_match   REAL NOT NULL DEFAULT 0,
  -- Tone-match component of the voice score in [0,1] (kept for explainability).
  tone_match    REAL NOT NULL DEFAULT 0,
  -- JSON array of banned words the draft tripped: ["spam"]. '[]' when clean.
  banned_hits_json TEXT NOT NULL DEFAULT '[]',
  -- Routing decision: 'auto_send' when both scores cleared their thresholds,
  -- otherwise 'queue' (held for approval). CHECK-constrained against typos.
  decision      TEXT NOT NULL DEFAULT 'queue'
                  CHECK (decision IN ('auto_send','queue')),
  -- Optional model identifier that produced the draft (e.g. 'gemma3:4b').
  model         TEXT,
  -- 1 when a human edited the queued draft before it was sent, else 0.
  human_override INTEGER NOT NULL DEFAULT 0,
  -- Terminal outcome once resolved: 'sent', 'rejected', or 'pending'.
  outcome       TEXT NOT NULL DEFAULT 'pending'
                  CHECK (outcome IN ('pending','sent','rejected')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auto_reply_audit_thread
  ON auto_reply_audit (thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auto_reply_audit_created
  ON auto_reply_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auto_reply_audit_contact
  ON auto_reply_audit (contact_id);
