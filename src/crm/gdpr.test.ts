/**
 * GDPR right-to-delete — unit tests (epic #90, sub #138).
 *
 * Covers:
 *   - Single-contact delete (all related rows, receipt returned)
 *   - Cascade delete of merge-history audit rows
 *   - 409 when contact has merge history and cascade=false
 *   - 404 path for non-existent contact
 *   - Row counts in the receipt
 */
import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../db/index.js";
import { deleteContact, GdprDeleteError } from "./gdpr.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertSocialContact(db: Database, platform: string, platformContactId: string): number {
  return Number(
    db
      .prepare(`INSERT INTO social_contacts (platform, platform_contact_id) VALUES (?, ?)`)
      .run(platform, platformContactId).lastInsertRowid
  );
}

function insertCrmContact(db: Database, displayName: string): number {
  return Number(
    db.prepare(`INSERT INTO crm_contacts (display_name) VALUES (?)`).run(displayName)
      .lastInsertRowid
  );
}

function linkCrmToSocial(db: Database, crmContactId: number, socialContactId: number): void {
  db.prepare(`INSERT INTO crm_contact_links (crm_contact_id, social_contact_id) VALUES (?, ?)`).run(
    crmContactId,
    socialContactId
  );
}

let msgSeq = 0;
function insertMessage(db: Database, contactId: number, platform: string): number {
  msgSeq++;
  return Number(
    db
      .prepare(
        `INSERT INTO social_messages
           (platform, platform_message_id, contact_id, direction, body)
         VALUES (?, ?, ?, 'inbound', 'hello')`
      )
      .run(platform, `msg-${msgSeq}`, contactId).lastInsertRowid
  );
}

function insertAuditRow(db: Database, contactId: number | null): number {
  return Number(
    db
      .prepare(
        `INSERT INTO auto_reply_audit
           (thread_id, contact_id, platform, prompt, draft_text, confidence, voice_match,
            tone_match, decision, created_at, updated_at)
         VALUES ('t1', ?, 'twitter', 'prompt', 'draft', 0.9, 0.8, 0.8, 'auto_send',
                 unixepoch('now'), unixepoch('now'))`
      )
      .run(contactId).lastInsertRowid
  );
}

function insertInsightRow(db: Database, platform: string, objectId: string): number {
  return Number(
    db
      .prepare(
        `INSERT OR IGNORE INTO platform_insights_raw
           (platform, object_type, object_id, metric, value, captured_for)
         VALUES (?, 'account', ?, 'likes', 10, '2025-01-01')`
      )
      .run(platform, objectId).lastInsertRowid
  );
}

function insertMergeRecord(db: Database, survivorId: number, sourceId: number): void {
  db.prepare(
    `INSERT INTO crm_contact_merges (survivor_id, source_id, mode) VALUES (?, ?, 'manual')`
  ).run(survivorId, sourceId);
}

function countRows(db: Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("deleteContact", () => {
  let db: Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    msgSeq = 0;
  });

  afterEach(() => {
    db.close();
  });

  describe("non-existent contact", () => {
    it("throws GdprDeleteError with status 404 for unknown id", () => {
      expect(() => deleteContact(db, 999, { cascadeMerges: false })).toThrow(GdprDeleteError);
      try {
        deleteContact(db, 999, { cascadeMerges: false });
      } catch (err) {
        expect(err).toBeInstanceOf(GdprDeleteError);
        expect((err as GdprDeleteError).status).toBe(404);
      }
    });
  });

  describe("simple delete (no messages, no audit, no merge history)", () => {
    it("deletes the contact and returns a receipt", () => {
      const crmId = insertCrmContact(db, "Alice");
      const receipt = deleteContact(db, crmId, { cascadeMerges: false });

      expect(receipt.contactId).toBe(String(crmId));
      expect(receipt.rowsDeleted.contacts).toBe(1);
      expect(receipt.rowsDeleted.social_messages).toBe(0);
      expect(receipt.rowsDeleted.auto_reply_audit).toBe(0);
      expect(receipt.rowsDeleted.platform_insights_raw).toBe(0);
      expect(receipt.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(countRows(db, "crm_contacts")).toBe(0);
    });
  });

  describe("delete with linked social contacts and messages", () => {
    it("deletes social_messages for all linked social contacts", () => {
      const crmId = insertCrmContact(db, "Bob");
      const sc1 = insertSocialContact(db, "twitter", "tw1");
      const sc2 = insertSocialContact(db, "instagram", "ig1");
      linkCrmToSocial(db, crmId, sc1);
      linkCrmToSocial(db, crmId, sc2);
      insertMessage(db, sc1, "twitter");
      insertMessage(db, sc1, "twitter");
      insertMessage(db, sc2, "instagram");

      const receipt = deleteContact(db, crmId, { cascadeMerges: false });

      expect(receipt.rowsDeleted.social_messages).toBe(3);
      expect(countRows(db, "social_messages")).toBe(0);
    });

    it("only deletes messages for the target contact, not others", () => {
      const crmId = insertCrmContact(db, "Bob");
      const sc1 = insertSocialContact(db, "twitter", "tw1");
      linkCrmToSocial(db, crmId, sc1);
      insertMessage(db, sc1, "twitter");

      const otherSc = insertSocialContact(db, "twitter", "tw2");
      insertMessage(db, otherSc, "twitter"); // unrelated contact's message

      deleteContact(db, crmId, { cascadeMerges: false });

      // unrelated message must survive
      expect(countRows(db, "social_messages")).toBe(1);
    });
  });

  describe("delete with auto_reply_audit rows", () => {
    it("deletes auto_reply_audit rows referencing the contact", () => {
      const crmId = insertCrmContact(db, "Charlie");
      insertAuditRow(db, crmId);
      insertAuditRow(db, crmId);

      const receipt = deleteContact(db, crmId, { cascadeMerges: false });

      expect(receipt.rowsDeleted.auto_reply_audit).toBe(2);
      expect(countRows(db, "auto_reply_audit")).toBe(0);
    });

    it("preserves audit rows for other contacts", () => {
      const crmId = insertCrmContact(db, "Charlie");
      insertAuditRow(db, crmId);
      insertAuditRow(db, null); // not linked to any contact

      deleteContact(db, crmId, { cascadeMerges: false });

      expect(countRows(db, "auto_reply_audit")).toBe(1);
    });
  });

  describe("delete with platform_insights_raw rows", () => {
    it("deletes platform_insights_raw rows for linked social contacts", () => {
      const crmId = insertCrmContact(db, "Dana");
      const sc = insertSocialContact(db, "instagram", "ig_dana");
      linkCrmToSocial(db, crmId, sc);
      insertInsightRow(db, "instagram", "ig_dana");
      insertInsightRow(db, "instagram", "ig_dana"); // duplicate blocked by UNIQUE

      const receipt = deleteContact(db, crmId, { cascadeMerges: false });

      expect(receipt.rowsDeleted.platform_insights_raw).toBe(1);
      expect(countRows(db, "platform_insights_raw")).toBe(0);
    });

    it("does not delete insights for unrelated objects", () => {
      const crmId = insertCrmContact(db, "Dana");
      const sc = insertSocialContact(db, "instagram", "ig_dana");
      linkCrmToSocial(db, crmId, sc);
      insertInsightRow(db, "instagram", "ig_dana");
      insertInsightRow(db, "instagram", "ig_other"); // different object

      deleteContact(db, crmId, { cascadeMerges: false });

      expect(countRows(db, "platform_insights_raw")).toBe(1);
    });
  });

  describe("409 path — merge history without cascade", () => {
    it("throws GdprDeleteError with status 409 when contact has merge history and cascadeMerges=false", () => {
      const survivorId = insertCrmContact(db, "Eve");
      insertMergeRecord(db, survivorId, 9999);

      expect(() => deleteContact(db, survivorId, { cascadeMerges: false })).toThrow(
        GdprDeleteError
      );
      try {
        deleteContact(db, survivorId, { cascadeMerges: false });
      } catch (err) {
        expect((err as GdprDeleteError).status).toBe(409);
      }
      // contact must NOT have been deleted
      expect(countRows(db, "crm_contacts")).toBe(1);
    });
  });

  describe("cascade delete of merge history", () => {
    it("deletes crm_contact_merges rows for the contact when cascadeMerges=true", () => {
      const survivorId = insertCrmContact(db, "Frank");
      insertMergeRecord(db, survivorId, 9998);
      insertMergeRecord(db, survivorId, 9997);

      const receipt = deleteContact(db, survivorId, { cascadeMerges: true });

      expect(receipt.rowsDeleted.merged_contacts).toBe(2);
      expect(countRows(db, "crm_contact_merges")).toBe(0);
    });

    it("preserves merge records for other survivors when cascadeMerges=true", () => {
      const crmId = insertCrmContact(db, "Frank");
      const otherSurvivorId = insertCrmContact(db, "Gina");
      insertMergeRecord(db, crmId, 9996);
      insertMergeRecord(db, otherSurvivorId, 9995);

      deleteContact(db, crmId, { cascadeMerges: true });

      expect(countRows(db, "crm_contact_merges")).toBe(1);
    });

    it("succeeds with cascadeMerges=true even when no merge history exists", () => {
      const crmId = insertCrmContact(db, "Hank");
      const receipt = deleteContact(db, crmId, { cascadeMerges: true });
      expect(receipt.rowsDeleted.merged_contacts).toBe(0);
    });
  });

  describe("full cascade: all tables cleaned in one transaction", () => {
    it("returns correct row counts for every table in the receipt", () => {
      const crmId = insertCrmContact(db, "Ivy");
      const sc = insertSocialContact(db, "twitter", "tw_ivy");
      linkCrmToSocial(db, crmId, sc);
      insertMessage(db, sc, "twitter");
      insertMessage(db, sc, "twitter");
      insertAuditRow(db, crmId);
      insertInsightRow(db, "twitter", "tw_ivy");
      insertMergeRecord(db, crmId, 9990);

      const receipt = deleteContact(db, crmId, { cascadeMerges: true });

      expect(receipt.rowsDeleted.contacts).toBe(1);
      expect(receipt.rowsDeleted.social_messages).toBe(2);
      expect(receipt.rowsDeleted.auto_reply_audit).toBe(1);
      expect(receipt.rowsDeleted.platform_insights_raw).toBe(1);
      expect(receipt.rowsDeleted.merged_contacts).toBe(1);

      expect(countRows(db, "crm_contacts")).toBe(0);
      expect(countRows(db, "crm_contact_links")).toBe(0);
      expect(countRows(db, "social_messages")).toBe(0);
      expect(countRows(db, "auto_reply_audit")).toBe(0);
      expect(countRows(db, "platform_insights_raw")).toBe(0);
      expect(countRows(db, "crm_contact_merges")).toBe(0);
    });
  });
});
