import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../db/index.js";
import { CrmRepository, MergeError } from "./repository.js";

/** Insert a social contact and return its id. */
function insertSocialContact(
  db: Database,
  opts: {
    platform: string;
    platformContactId: string;
    handle?: string;
    displayName?: string;
    metadata?: Record<string, unknown>;
  }
): number {
  const info = db
    .prepare(
      `INSERT INTO social_contacts
         (platform, platform_contact_id, handle, display_name, metadata_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      opts.platform,
      opts.platformContactId,
      opts.handle ?? null,
      opts.displayName ?? null,
      opts.metadata ? JSON.stringify(opts.metadata) : null
    );
  return Number(info.lastInsertRowid);
}

let messageSeq = 0;

/** Insert a social message for a contact. `sentAt` is a SQLite datetime modifier. */
function insertMessage(
  db: Database,
  opts: {
    platform: string;
    contactId: number;
    direction?: "inbound" | "outbound";
    body: string;
    sinceModifier?: string; // e.g. "-1 days"; defaults to now
  }
): number {
  messageSeq += 1;
  const sentAtExpr = opts.sinceModifier
    ? `datetime('now', '${opts.sinceModifier}')`
    : `datetime('now')`;
  const info = db
    .prepare(
      `INSERT INTO social_messages
         (platform, platform_message_id, contact_id, direction, body, sent_at)
       VALUES (?, ?, ?, ?, ?, ${sentAtExpr})`
    )
    .run(
      opts.platform,
      `msg-${messageSeq}`,
      opts.contactId,
      opts.direction ?? "inbound",
      opts.body
    );
  return Number(info.lastInsertRowid);
}

describe("CrmRepository", () => {
  let db: Database;
  let repo: CrmRepository;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    repo = new CrmRepository(db);
    messageSeq = 0;
  });

  afterEach(() => {
    db.close();
  });

  describe("sync", () => {
    it("creates exactly one CRM identity per social contact and is idempotent", () => {
      insertSocialContact(db, { platform: "twitter", platformContactId: "t1", handle: "ada" });
      insertSocialContact(db, { platform: "linkedin", platformContactId: "l1", handle: "ada-l" });

      repo.sync();
      repo.sync(); // second call must not duplicate

      const count = db.prepare(`SELECT COUNT(*) AS n FROM crm_contacts`).get() as { n: number };
      expect(count.n).toBe(2);
      const links = db.prepare(`SELECT COUNT(*) AS n FROM crm_contact_links`).get() as {
        n: number;
      };
      expect(links.n).toBe(2);
    });

    it("discovers email + follower count from social metadata", () => {
      insertSocialContact(db, {
        platform: "instagram",
        platformContactId: "ig1",
        handle: "ada",
        displayName: "Ada Lovelace",
        metadata: { bio: "email ada@studio.com for collabs", followers: 4200 }
      });

      const [contact] = repo.listContacts();
      expect(contact.email).toBe("ada@studio.com");
      expect(contact.followerCount).toBe(4200);
      expect(contact.displayName).toBe("Ada Lovelace");
    });
  });

  describe("lead scoring (epic #92 acceptance)", () => {
    it("buckets a contact with 30+ engagements in the last 7 days as top", () => {
      const sc = insertSocialContact(db, { platform: "twitter", platformContactId: "t1" });
      for (let i = 0; i < 30; i++) {
        insertMessage(db, {
          platform: "twitter",
          contactId: sc,
          body: `ping ${i}`,
          sinceModifier: "-1 days"
        });
      }

      const [contact] = repo.listContacts();
      expect(contact.engagementCount).toBe(30);
      expect(contact.leadScore.bucket).toBe("top");
    });

    it("excludes engagements outside the window", () => {
      const sc = insertSocialContact(db, { platform: "twitter", platformContactId: "t1" });
      insertMessage(db, {
        platform: "twitter",
        contactId: sc,
        body: "recent",
        sinceModifier: "-1 days"
      });
      insertMessage(db, {
        platform: "twitter",
        contactId: sc,
        body: "old",
        sinceModifier: "-30 days"
      });

      const [contact] = repo.listContacts();
      expect(contact.engagementCount).toBe(1);
    });

    it("scores a silent contact in the low bucket", () => {
      insertSocialContact(db, { platform: "twitter", platformContactId: "t1" });
      const [contact] = repo.listContacts();
      expect(contact.engagementCount).toBe(0);
      expect(contact.leadScore.bucket).toBe("low");
    });
  });

  describe("timeline", () => {
    it("aggregates messages across linked accounts in chronological order", () => {
      const sc = insertSocialContact(db, { platform: "twitter", platformContactId: "t1" });
      insertMessage(db, {
        platform: "twitter",
        contactId: sc,
        body: "second",
        sinceModifier: "-1 days"
      });
      insertMessage(db, {
        platform: "twitter",
        contactId: sc,
        body: "first",
        sinceModifier: "-2 days"
      });

      repo.sync();
      const [contact] = repo.listContacts();
      const detail = repo.getContactDetail(contact.id);
      expect(detail?.timeline.map((m) => m.body)).toEqual(["first", "second"]);
    });
  });

  describe("suggested merges (#94)", () => {
    it("flags two identities sharing a normalised email", () => {
      insertSocialContact(db, {
        platform: "instagram",
        platformContactId: "ig1",
        handle: "ada",
        metadata: { bio: "email Ada@Studio.com" }
      });
      insertSocialContact(db, {
        platform: "linkedin",
        platformContactId: "li1",
        handle: "ada-pro",
        metadata: { bio: "contact: ada@studio.com" }
      });

      const suggestions = repo.suggestedMerges();
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].email).toBe("ada@studio.com");
      expect(suggestions[0].contacts).toHaveLength(2);
    });

    it("does not flag distinct emails", () => {
      insertSocialContact(db, {
        platform: "instagram",
        platformContactId: "ig1",
        metadata: { bio: "ada@studio.com" }
      });
      insertSocialContact(db, {
        platform: "linkedin",
        platformContactId: "li1",
        metadata: { bio: "grace@navy.mil" }
      });

      expect(repo.suggestedMerges()).toHaveLength(0);
    });
  });

  describe("merge (#94 manual merge)", () => {
    it("folds the source into the survivor, preserving chronological history", () => {
      const igc = insertSocialContact(db, {
        platform: "instagram",
        platformContactId: "ig1",
        displayName: "Ada (IG)",
        metadata: { bio: "ada@studio.com", followers: 1000 }
      });
      const lic = insertSocialContact(db, {
        platform: "linkedin",
        platformContactId: "li1",
        displayName: "Ada (LI)",
        metadata: { bio: "ada@studio.com", followers: 5000 }
      });
      insertMessage(db, {
        platform: "instagram",
        contactId: igc,
        body: "ig-first",
        sinceModifier: "-3 days"
      });
      insertMessage(db, {
        platform: "linkedin",
        contactId: lic,
        body: "li-middle",
        sinceModifier: "-2 days"
      });
      insertMessage(db, {
        platform: "instagram",
        contactId: igc,
        body: "ig-last",
        sinceModifier: "-1 days"
      });

      const contacts = repo.listContacts();
      const survivor = contacts.find((c) => c.linkedAccounts[0].platform === "instagram")!;
      const source = contacts.find((c) => c.linkedAccounts[0].platform === "linkedin")!;

      const merged = repo.merge(survivor.id, source.id);

      // Source identity is gone; survivor now owns both links.
      expect(repo.getContact(source.id)).toBeUndefined();
      expect(merged.linkedAccounts.map((a) => a.platform).sort()).toEqual([
        "instagram",
        "linkedin"
      ]);
      // History preserved chronologically across both platforms.
      expect(merged.timeline.map((m) => m.body)).toEqual(["ig-first", "li-middle", "ig-last"]);
      // Follower count backfilled to the max of the two.
      expect(merged.followerCount).toBe(5000);
      // A merge audit row is recorded.
      const merges = repo.listMerges();
      expect(merges).toHaveLength(1);
      expect(merges[0]).toMatchObject({
        survivorId: survivor.id,
        sourceId: source.id,
        mode: "manual"
      });
    });

    it("rejects merging a contact into itself", () => {
      insertSocialContact(db, { platform: "twitter", platformContactId: "t1" });
      const [contact] = repo.listContacts();
      expect(() => repo.merge(contact.id, contact.id)).toThrow(MergeError);
    });

    it("rejects an unknown survivor or source", () => {
      insertSocialContact(db, { platform: "twitter", platformContactId: "t1" });
      const [contact] = repo.listContacts();
      expect(() => repo.merge(contact.id, 9999)).toThrow(MergeError);
      expect(() => repo.merge(9999, contact.id)).toThrow(MergeError);
    });
  });

  describe("listContacts limits (SQLite LIMIT -1 gotcha)", () => {
    it("normalises a negative limit to the default rather than returning unbounded", () => {
      for (let i = 0; i < 3; i++) {
        insertSocialContact(db, { platform: "twitter", platformContactId: `t${i}` });
      }
      expect(repo.listContacts({ limit: -1 })).toHaveLength(3);
      expect(repo.listContacts({ limit: Number.NaN })).toHaveLength(3);
    });

    it("honours a positive limit", () => {
      for (let i = 0; i < 5; i++) {
        insertSocialContact(db, { platform: "twitter", platformContactId: `t${i}` });
      }
      expect(repo.listContacts({ limit: 2 })).toHaveLength(2);
    });
  });
});
