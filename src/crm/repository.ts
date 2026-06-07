/**
 * Light CRM repository (epic #90).
 *
 * Layers a cross-platform identity (`crm_contacts`) over the SocialBrain store
 * (`social_contacts` / `social_threads` / `social_messages`) created by
 * migration `0009-crm.sql`. Responsibilities:
 *
 *   - Sync: ensure every platform-native `social_contacts` row maps to exactly
 *     one CRM identity ({@link CrmRepository.sync}), discovering its email and
 *     follower count from metadata/messages.
 *   - Read: list/detail with a deterministic {@link scoreLead} lead score and a
 *     conversation timeline aggregated across every linked account.
 *   - Suggested merges (#94): identities sharing a normalised email.
 *   - Manual merge (#94): fold a source identity into a survivor in a single
 *     transaction, re-pointing the links so history stays chronological.
 *
 * All SQL uses better-sqlite3 prepared statements — no string-built SQL, no
 * injection. The repository takes a `Database` by injection so tests use
 * `:memory:` and the server uses `getDb()`.
 */
import type { Database, Statement } from "better-sqlite3";

import {
  DEFAULT_LEAD_SCORE_WEIGHTS,
  scoreLead,
  type LeadScore,
  type LeadScoreWeights
} from "./lead-score.js";
import { discoverEmail, discoverFollowerCount, normalizeEmail } from "./email.js";

/** A cross-platform CRM identity. */
export interface CrmContact {
  id: number;
  displayName?: string;
  email?: string;
  followerCount: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** A linked platform-native account on a CRM identity. */
export interface LinkedAccount {
  socialContactId: number;
  platform: string;
  platformContactId: string;
  handle?: string;
  displayName?: string;
  avatarUrl?: string;
}

/** A single message in a CRM contact's unified conversation timeline. */
export interface TimelineMessage {
  id: number;
  platform: string;
  direction: "inbound" | "outbound";
  body: string;
  at: string;
}

/** A CRM contact enriched with its lead score (list/detail payload). */
export interface ScoredContact extends CrmContact {
  linkedAccounts: LinkedAccount[];
  engagementCount: number;
  leadScore: LeadScore;
}

/** A full CRM contact detail: scored contact + conversation timeline. */
export interface ContactDetail extends ScoredContact {
  timeline: TimelineMessage[];
  /** Number of merge-audit rows where this contact was the survivor. Used by
   *  the UI to decide whether to offer a cascade-delete option (AC3 #138). */
  mergeCount: number;
}

/** A suggested merge: two identities sharing a normalised email. */
export interface SuggestedMerge {
  email: string;
  contacts: [CrmContact, CrmContact];
}

/** A recorded merge audit row. */
export interface MergeRecord {
  id: number;
  survivorId: number;
  sourceId: number;
  mode: "manual" | "suggested";
  createdAt: string;
}

/** Options for {@link CrmRepository.listContacts}. */
export interface ListContactsOptions {
  limit?: number;
  offset?: number;
}

/** Thrown when a merge request references a missing or invalid identity. */
export class MergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MergeError";
  }
}

interface ContactRow {
  id: number;
  display_name: string | null;
  email: string | null;
  follower_count: number;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

interface LinkRow {
  social_contact_id: number;
  platform: string;
  platform_contact_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface MessageRow {
  id: number;
  platform: string;
  direction: string;
  body: string;
  at: string;
}

interface MergeRow {
  id: number;
  survivor_id: number;
  source_id: number;
  mode: string;
  created_at: string;
}

interface SocialContactRow {
  id: number;
  metadata_json: string | null;
}

/** Default sliding-window engagement query bound to the configured days. */
function windowModifier(days: number): string {
  const safe = Number.isFinite(days) && days > 0 ? Math.floor(days) : 7;
  return `-${safe} days`;
}

function parseMetadata(json: string | null): Record<string, unknown> | undefined {
  if (json === null) return undefined;
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function toContact(row: ContactRow): CrmContact {
  return {
    id: row.id,
    displayName: row.display_name ?? undefined,
    email: row.email ?? undefined,
    followerCount: row.follower_count,
    metadata: parseMetadata(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class CrmRepository {
  private readonly db: Database;
  private readonly weights: () => LeadScoreWeights;
  private readonly stmts: {
    insertContact: Statement;
    getContact: Statement;
    listContacts: Statement;
    updateContact: Statement;
    deleteContact: Statement;
    batchLinks: Statement;
    batchEngagement: Statement;
    batchRecentBodies: Statement;
    getLink: Statement;
    insertLink: Statement;
    repointLinks: Statement;
    listLinks: Statement;
    countEngagement: Statement;
    listRecentBodies: Statement;
    listTimeline: Statement;
    unlinkedSocialContacts: Statement;
    insertMerge: Statement;
    listMerges: Statement;
    emailGroups: Statement;
  };

  constructor(db: Database, weights: () => LeadScoreWeights = () => DEFAULT_LEAD_SCORE_WEIGHTS) {
    this.db = db;
    this.weights = weights;
    this.stmts = {
      insertContact: db.prepare(
        `INSERT INTO crm_contacts (display_name, email, follower_count, metadata_json)
         VALUES (@displayName, @email, @followerCount, @metadataJson)`
      ),
      getContact: db.prepare(`SELECT * FROM crm_contacts WHERE id = ?`),
      listContacts: db.prepare(
        `SELECT * FROM crm_contacts
         ORDER BY datetime(updated_at) DESC, id DESC
         LIMIT @limit OFFSET @offset`
      ),
      updateContact: db.prepare(
        `UPDATE crm_contacts SET
           display_name   = @displayName,
           email          = @email,
           follower_count = @followerCount,
           metadata_json  = @metadataJson,
           updated_at     = datetime('now')
         WHERE id = @id`
      ),
      deleteContact: db.prepare(`DELETE FROM crm_contacts WHERE id = ?`),
      // --- Batched list aggregates (#165) -------------------------------------
      // listContacts() used to call linkedAccounts() + engagementCount() +
      // recentBodies() once *per contact* (a 3-query-per-row N+1). These three
      // statements fetch the same aggregates for a whole page of contacts in one
      // round-trip each. The contact id set is passed as a single bound JSON
      // array and expanded with json_each — no dynamically-built SQL.
      batchLinks: db.prepare(
        `SELECT l.crm_contact_id AS crm_id, l.social_contact_id, c.platform,
                c.platform_contact_id, c.handle, c.display_name, c.avatar_url
         FROM crm_contact_links l
         JOIN social_contacts c ON c.id = l.social_contact_id
         WHERE l.crm_contact_id IN (SELECT value FROM json_each(@ids))
         ORDER BY l.crm_contact_id ASC, l.social_contact_id ASC`
      ),
      batchEngagement: db.prepare(
        `SELECT l.crm_contact_id AS crm_id, COUNT(*) AS n
         FROM social_messages m
         JOIN crm_contact_links l ON l.social_contact_id = m.contact_id
         WHERE l.crm_contact_id IN (SELECT value FROM json_each(@ids))
           AND julianday(COALESCE(m.sent_at, m.created_at)) >= julianday('now', @since)
         GROUP BY l.crm_contact_id`
      ),
      batchRecentBodies: db.prepare(
        `SELECT crm_id, body FROM (
           SELECT l.crm_contact_id AS crm_id, m.body AS body,
                  ROW_NUMBER() OVER (
                    PARTITION BY l.crm_contact_id
                    ORDER BY COALESCE(m.sent_at, m.created_at) DESC, m.id DESC
                  ) AS rn
           FROM social_messages m
           JOIN crm_contact_links l ON l.social_contact_id = m.contact_id
           WHERE l.crm_contact_id IN (SELECT value FROM json_each(@ids))
             AND julianday(COALESCE(m.sent_at, m.created_at)) >= julianday('now', @since)
         )
         WHERE rn <= @limit
         ORDER BY crm_id ASC, rn ASC`
      ),
      getLink: db.prepare(
        `SELECT crm_contact_id AS id FROM crm_contact_links WHERE social_contact_id = ?`
      ),
      insertLink: db.prepare(
        `INSERT INTO crm_contact_links (crm_contact_id, social_contact_id)
         VALUES (@crmContactId, @socialContactId)
         ON CONFLICT (social_contact_id)
         DO UPDATE SET crm_contact_id = @crmContactId`
      ),
      repointLinks: db.prepare(
        `UPDATE crm_contact_links SET crm_contact_id = @survivor WHERE crm_contact_id = @source`
      ),
      listLinks: db.prepare(
        `SELECT l.social_contact_id, c.platform, c.platform_contact_id,
                c.handle, c.display_name, c.avatar_url
         FROM crm_contact_links l
         JOIN social_contacts c ON c.id = l.social_contact_id
         WHERE l.crm_contact_id = ?
         ORDER BY l.social_contact_id ASC`
      ),
      countEngagement: db.prepare(
        `SELECT COUNT(*) AS n
         FROM social_messages m
         JOIN crm_contact_links l ON l.social_contact_id = m.contact_id
         WHERE l.crm_contact_id = @id
           AND julianday(COALESCE(m.sent_at, m.created_at)) >= julianday('now', @since)`
      ),
      listRecentBodies: db.prepare(
        `SELECT m.body
         FROM social_messages m
         JOIN crm_contact_links l ON l.social_contact_id = m.contact_id
         WHERE l.crm_contact_id = @id
           AND julianday(COALESCE(m.sent_at, m.created_at)) >= julianday('now', @since)
         ORDER BY COALESCE(m.sent_at, m.created_at) DESC, m.id DESC
         LIMIT @limit`
      ),
      listTimeline: db.prepare(
        `SELECT m.id, m.platform, m.direction, m.body,
                COALESCE(m.sent_at, m.created_at) AS at
         FROM social_messages m
         JOIN crm_contact_links l ON l.social_contact_id = m.contact_id
         WHERE l.crm_contact_id = ?
         ORDER BY COALESCE(m.sent_at, m.created_at) ASC, m.id ASC`
      ),
      unlinkedSocialContacts: db.prepare(
        `SELECT c.id, c.metadata_json
         FROM social_contacts c
         LEFT JOIN crm_contact_links l ON l.social_contact_id = c.id
         WHERE l.social_contact_id IS NULL
         ORDER BY c.id ASC`
      ),
      insertMerge: db.prepare(
        `INSERT INTO crm_contact_merges (survivor_id, source_id, mode)
         VALUES (@survivorId, @sourceId, @mode)`
      ),
      listMerges: db.prepare(
        `SELECT * FROM crm_contact_merges ORDER BY id DESC LIMIT @limit OFFSET @offset`
      ),
      emailGroups: db.prepare(
        `SELECT email, COUNT(*) AS n FROM crm_contacts
         WHERE email IS NOT NULL AND email <> ''
         GROUP BY email HAVING n > 1
         ORDER BY email ASC`
      )
    };
  }

  /** Read one CRM identity by id. */
  getContact(id: number): CrmContact | undefined {
    const row = this.stmts.getContact.get(id) as ContactRow | undefined;
    return row ? toContact(row) : undefined;
  }

  /** The platform-native accounts linked to a CRM identity. */
  linkedAccounts(crmContactId: number): LinkedAccount[] {
    const rows = this.stmts.listLinks.all(crmContactId) as LinkRow[];
    return rows.map((r) => ({
      socialContactId: r.social_contact_id,
      platform: r.platform,
      platformContactId: r.platform_contact_id,
      handle: r.handle ?? undefined,
      displayName: r.display_name ?? undefined,
      avatarUrl: r.avatar_url ?? undefined
    }));
  }

  /** Engagement count (any direction) within the configured window. */
  engagementCount(crmContactId: number): number {
    const since = windowModifier(this.weights().engagementWindowDays);
    const row = this.stmts.countEngagement.get({ id: crmContactId, since }) as { n: number };
    return row.n;
  }

  /** Recent message bodies within the window (for the sentiment heuristic). */
  private recentBodies(crmContactId: number, limit = 50): string[] {
    const since = windowModifier(this.weights().engagementWindowDays);
    const rows = this.stmts.listRecentBodies.all({
      id: crmContactId,
      since,
      limit
    }) as Array<{ body: string }>;
    return rows.map((r) => r.body);
  }

  /** The full chronological conversation timeline across every linked account. */
  timeline(crmContactId: number): TimelineMessage[] {
    const rows = this.stmts.listTimeline.all(crmContactId) as MessageRow[];
    return rows.map((r) => ({
      id: r.id,
      platform: r.platform,
      direction: r.direction === "outbound" ? "outbound" : "inbound",
      body: r.body,
      at: r.at
    }));
  }

  /** Compute the lead score for a CRM identity from its live engagement data. */
  scoreContact(
    crmContactId: number,
    followerCount: number
  ): {
    engagementCount: number;
    leadScore: LeadScore;
  } {
    const engagementCount = this.engagementCount(crmContactId);
    const leadScore = scoreLead(
      {
        engagementCount,
        followerCount,
        recentMessages: this.recentBodies(crmContactId)
      },
      this.weights()
    );
    return { engagementCount, leadScore };
  }

  /** Enrich a bare contact with linked accounts + lead score. */
  private enrich(contact: CrmContact): ScoredContact {
    const { engagementCount, leadScore } = this.scoreContact(contact.id, contact.followerCount);
    return {
      ...contact,
      linkedAccounts: this.linkedAccounts(contact.id),
      engagementCount,
      leadScore
    };
  }

  /**
   * List CRM identities (most-recently-updated first) with lead scores. Calls
   * {@link CrmRepository.sync} first so newly-ingested social contacts surface.
   *
   * The per-row aggregates (linked accounts, engagement count, lead-score
   * inputs) are fetched in a fixed number of batched queries rather than
   * O(n)-per-row (#165): the page's contact ids are passed once to three
   * `json_each`-expanded statements and grouped in memory. Lead scores are
   * computed by the same {@link scoreLead} call as the single-contact path, so
   * results are identical.
   */
  listContacts(options: ListContactsOptions = {}): ScoredContact[] {
    this.sync();
    const limit = normalizeLimit(options.limit, 100);
    const offset = options.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
    const rows = this.stmts.listContacts.all({ limit, offset }) as ContactRow[];
    if (rows.length === 0) return [];

    const contacts = rows.map(toContact);
    const ids = JSON.stringify(contacts.map((c) => c.id));
    const since = windowModifier(this.weights().engagementWindowDays);

    const linksByContact = new Map<number, LinkedAccount[]>();
    for (const r of this.stmts.batchLinks.all({ ids }) as Array<LinkRow & { crm_id: number }>) {
      const list = linksByContact.get(r.crm_id) ?? [];
      list.push({
        socialContactId: r.social_contact_id,
        platform: r.platform,
        platformContactId: r.platform_contact_id,
        handle: r.handle ?? undefined,
        displayName: r.display_name ?? undefined,
        avatarUrl: r.avatar_url ?? undefined
      });
      linksByContact.set(r.crm_id, list);
    }

    const engagementByContact = new Map<number, number>();
    for (const r of this.stmts.batchEngagement.all({ ids, since }) as Array<{
      crm_id: number;
      n: number;
    }>) {
      engagementByContact.set(r.crm_id, r.n);
    }

    const bodiesByContact = new Map<number, string[]>();
    for (const r of this.stmts.batchRecentBodies.all({ ids, since, limit: 50 }) as Array<{
      crm_id: number;
      body: string;
    }>) {
      const list = bodiesByContact.get(r.crm_id) ?? [];
      list.push(r.body);
      bodiesByContact.set(r.crm_id, list);
    }

    const weights = this.weights();
    return contacts.map((contact) => {
      const engagementCount = engagementByContact.get(contact.id) ?? 0;
      const leadScore = scoreLead(
        {
          engagementCount,
          followerCount: contact.followerCount,
          recentMessages: bodiesByContact.get(contact.id) ?? []
        },
        weights
      );
      return {
        ...contact,
        linkedAccounts: linksByContact.get(contact.id) ?? [],
        engagementCount,
        leadScore
      };
    });
  }

  /** Full detail (scored contact + timeline) for one identity. */
  getContactDetail(id: number): ContactDetail | undefined {
    const contact = this.getContact(id);
    if (!contact) return undefined;
    const mergeRow = this.db
      .prepare(`SELECT COUNT(*) AS n FROM crm_contact_merges WHERE survivor_id = ?`)
      .get(id) as { n: number };
    return { ...this.enrich(contact), timeline: this.timeline(id), mergeCount: mergeRow.n };
  }

  /**
   * Idempotently ensure every `social_contacts` row maps to a CRM identity.
   * For each unlinked social contact a new identity is created with the email
   * and follower count discovered from its metadata + recent messages.
   */
  sync(): void {
    const unlinked = this.stmts.unlinkedSocialContacts.all() as SocialContactRow[];
    if (unlinked.length === 0) return;
    const tx = this.db.transaction(() => {
      for (const row of unlinked) {
        this.createIdentityForSocialContact(row.id, parseMetadata(row.metadata_json));
      }
    });
    tx();
  }

  /** Create a CRM identity for a single social contact and link them. */
  private createIdentityForSocialContact(
    socialContactId: number,
    metadata: Record<string, unknown> | undefined
  ): number {
    const bodies = this.bodiesForSocialContact(socialContactId);
    const email = discoverEmail(metadata, bodies) ?? null;
    const followerCount = discoverFollowerCount(metadata);
    const displayName = this.displayNameForSocialContact(socialContactId);
    const info = this.stmts.insertContact.run({
      displayName,
      email,
      followerCount,
      metadataJson: null
    });
    const crmContactId = Number(info.lastInsertRowid);
    this.stmts.insertLink.run({ crmContactId, socialContactId });
    return crmContactId;
  }

  /** Recent message bodies for a single social contact (email discovery). */
  private bodiesForSocialContact(socialContactId: number): string[] {
    const rows = this.db
      .prepare(
        `SELECT body FROM social_messages WHERE contact_id = ?
         ORDER BY COALESCE(sent_at, created_at) DESC, id DESC LIMIT 50`
      )
      .all(socialContactId) as Array<{ body: string }>;
    return rows.map((r) => r.body);
  }

  /** Best display name for a social contact (display_name then handle). */
  private displayNameForSocialContact(socialContactId: number): string | null {
    const row = this.db
      .prepare(`SELECT display_name, handle FROM social_contacts WHERE id = ?`)
      .get(socialContactId) as { display_name: string | null; handle: string | null } | undefined;
    return row?.display_name ?? row?.handle ?? null;
  }

  /** Suggested merges: identities sharing a normalised email. */
  suggestedMerges(): SuggestedMerge[] {
    this.sync();
    const groups = this.stmts.emailGroups.all() as Array<{ email: string; n: number }>;
    const out: SuggestedMerge[] = [];
    for (const group of groups) {
      const rows = this.db
        .prepare(`SELECT * FROM crm_contacts WHERE email = ? ORDER BY id ASC`)
        .all(group.email) as ContactRow[];
      const contacts = rows.map(toContact);
      // Emit every unordered pair within the email group so a human can confirm.
      for (let i = 0; i < contacts.length; i++) {
        const first = contacts[i];
        if (!first) continue;
        for (let j = i + 1; j < contacts.length; j++) {
          const second = contacts[j];
          if (!second) continue;
          out.push({ email: group.email, contacts: [first, second] });
        }
      }
    }
    return out;
  }

  /** Recorded merge history (most recent first). */
  listMerges(limit = 100, offset = 0): MergeRecord[] {
    const rows = this.stmts.listMerges.all({
      limit: normalizeLimit(limit, 100),
      offset: offset > 0 ? Math.floor(offset) : 0
    }) as MergeRow[];
    return rows.map((r) => ({
      id: r.id,
      survivorId: r.survivor_id,
      sourceId: r.source_id,
      mode: r.mode === "suggested" ? "suggested" : "manual",
      createdAt: r.created_at
    }));
  }

  /**
   * Fold `sourceId` into `survivorId` in a single transaction (#94):
   *   1. re-point every link from the source identity to the survivor,
   *   2. backfill the survivor's email/follower/display fields from the source,
   *   3. record a `crm_contact_merges` audit row,
   *   4. delete the source identity.
   *
   * Conversation history is preserved automatically: messages are joined via the
   * re-pointed links and ordered by `COALESCE(sent_at, created_at)`.
   */
  merge(
    survivorId: number,
    sourceId: number,
    mode: "manual" | "suggested" = "manual"
  ): ContactDetail {
    if (survivorId === sourceId) {
      throw new MergeError("cannot merge a contact into itself");
    }
    const survivor = this.getContact(survivorId);
    if (!survivor) throw new MergeError(`survivor contact ${survivorId} not found`);
    const source = this.getContact(sourceId);
    if (!source) throw new MergeError(`source contact ${sourceId} not found`);

    const tx = this.db.transaction(() => {
      this.stmts.repointLinks.run({ survivor: survivorId, source: sourceId });
      this.stmts.updateContact.run({
        id: survivorId,
        displayName: survivor.displayName ?? source.displayName ?? null,
        email: normalizeEmail(survivor.email) ?? normalizeEmail(source.email) ?? null,
        followerCount: Math.max(survivor.followerCount, source.followerCount),
        metadataJson: survivor.metadata ? JSON.stringify(survivor.metadata) : null
      });
      this.stmts.insertMerge.run({ survivorId, sourceId, mode });
      this.stmts.deleteContact.run(sourceId);
    });
    tx();

    const detail = this.getContactDetail(survivorId);
    if (!detail) throw new MergeError(`survivor contact ${survivorId} vanished during merge`);
    return detail;
  }
}

/**
 * Normalise a list limit at the repository boundary. SQLite treats `LIMIT -1`
 * as unbounded, so negative/non-finite inputs must collapse to a sane default.
 */
function normalizeLimit(limit: number | undefined, fallback: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), 500);
}
