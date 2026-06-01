-- 0009-crm: Light CRM — cross-platform contacts, lead scoring, merges (epic #90).
--
-- Layers a unified-identity CRM on top of the SocialBrain inbound store (#127)
-- without retrofitting `social_contacts`. Each platform-native `social_contacts`
-- row links to exactly one `crm_contacts` identity. Merging two identities folds
-- the source into the survivor and re-points the links — the underlying
-- platform rows, threads, and messages are untouched, so conversation history
-- aggregates chronologically across every linked account.
--
--   * crm_contacts        (#91) — the cross-platform identity row.
--   * crm_contact_links   (#91) — identity ↔ social_contacts join (1:N).
--   * crm_contact_merges  (#94) — audit trail of folded identities.
--
-- Single transaction (the runner wraps it). No ad-hoc ALTER anywhere.

-- ---------------------------------------------------------------------------
-- crm_contacts — the cross-platform identity (#91)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_contacts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name   TEXT,
  -- Normalised (lowercased, trimmed) email used to suggest merges (#94).
  email          TEXT,
  -- Cached audience size; the lead scorer tolerates NULL/0 (#92).
  follower_count INTEGER NOT NULL DEFAULT 0,
  metadata_json  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_email
  ON crm_contacts(email);

-- ---------------------------------------------------------------------------
-- crm_contact_links — identity ↔ platform-native account (#91)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_contact_links (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  crm_contact_id    INTEGER NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  social_contact_id INTEGER NOT NULL REFERENCES social_contacts(id) ON DELETE CASCADE,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  -- A platform-native account belongs to exactly one CRM identity.
  UNIQUE (social_contact_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_contact_links_crm
  ON crm_contact_links(crm_contact_id);

-- ---------------------------------------------------------------------------
-- crm_contact_merges — folded-identity audit trail (#94)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm_contact_merges (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Surviving identity (kept) and source identity (deleted) at merge time.
  survivor_id INTEGER NOT NULL,
  source_id   INTEGER NOT NULL,
  -- 'manual' (operator) or 'suggested' (email-match queue).
  mode        TEXT NOT NULL DEFAULT 'manual',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_crm_contact_merges_survivor
  ON crm_contact_merges(survivor_id);
