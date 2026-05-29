import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../../db/index.js";
import { SocialBrainRepository } from "./repository.js";

describe("SocialBrainRepository", () => {
  let db: Database;
  let repo: SocialBrainRepository;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    repo = new SocialBrainRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates the three tables via migration 0002", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toContain("social_messages");
    expect(tables).toContain("social_threads");
    expect(tables).toContain("social_contacts");
  });

  describe("contacts", () => {
    it("upserts and reads back a contact", () => {
      const c = repo.upsertContact({
        platform: "instagram",
        platformContactId: "u1",
        handle: "alice",
        displayName: "Alice",
        metadata: { vip: true }
      });
      expect(c.id).toBeGreaterThan(0);
      expect(c.handle).toBe("alice");
      expect(c.metadata).toEqual({ vip: true });

      expect(repo.getContact(c.id)).toEqual(c);
      expect(repo.getContactByPlatformId("instagram", "u1")?.id).toBe(c.id);
    });

    it("is idempotent on (platform, platform_contact_id)", () => {
      const a = repo.upsertContact({ platform: "x", platformContactId: "42", handle: "bob" });
      const b = repo.upsertContact({ platform: "x", platformContactId: "42", displayName: "Bob" });
      expect(b.id).toBe(a.id);
      // COALESCE preserves the earlier handle while applying the new display name.
      expect(b.handle).toBe("bob");
      expect(b.displayName).toBe("Bob");
    });

    it("returns undefined for unknown contacts", () => {
      expect(repo.getContact(999)).toBeUndefined();
      expect(repo.getContactByPlatformId("x", "nope")).toBeUndefined();
    });
  });

  describe("threads", () => {
    it("associates a thread with a contact", () => {
      const contact = repo.upsertContact({ platform: "fb", platformContactId: "c9" });
      const thread = repo.upsertThread({
        platform: "fb",
        platformThreadId: "t1",
        contactId: contact.id,
        subject: "hello"
      });
      expect(thread.contactId).toBe(contact.id);
      expect(repo.getThread(thread.id)?.subject).toBe("hello");
      expect(repo.getThreadByPlatformId("fb", "t1")?.id).toBe(thread.id);
    });

    it("is idempotent on (platform, platform_thread_id)", () => {
      const a = repo.upsertThread({ platform: "fb", platformThreadId: "t2" });
      const b = repo.upsertThread({ platform: "fb", platformThreadId: "t2", subject: "later" });
      expect(b.id).toBe(a.id);
      expect(b.subject).toBe("later");
    });

    it("returns undefined for unknown threads", () => {
      expect(repo.getThread(123)).toBeUndefined();
      expect(repo.getThreadByPlatformId("fb", "missing")).toBeUndefined();
    });
  });

  describe("messages", () => {
    it("upserts, associates thread + contact, and reads back", () => {
      const contact = repo.upsertContact({ platform: "x", platformContactId: "a" });
      const thread = repo.upsertThread({ platform: "x", platformThreadId: "th" });
      const msg = repo.upsertMessage({
        platform: "x",
        platformMessageId: "m1",
        threadId: thread.id,
        contactId: contact.id,
        body: "hi there",
        metadata: { lang: "en" }
      });
      expect(msg.direction).toBe("inbound");
      expect(msg.threadId).toBe(thread.id);
      expect(msg.contactId).toBe(contact.id);
      expect(msg.metadata).toEqual({ lang: "en" });
      expect(repo.getMessage(msg.id)?.body).toBe("hi there");
      expect(repo.getMessageByPlatformId("x", "m1")?.id).toBe(msg.id);
    });

    it("is idempotent on (platform, platform_message_id) — no duplicate row", () => {
      const first = repo.upsertMessage({ platform: "x", platformMessageId: "dup", body: "v1" });
      const second = repo.upsertMessage({ platform: "x", platformMessageId: "dup", body: "v2" });
      expect(second.id).toBe(first.id);
      expect(second.body).toBe("v2");
      const count = (db.prepare("SELECT COUNT(*) AS n FROM social_messages").get() as { n: number })
        .n;
      expect(count).toBe(1);
    });

    it("stores outbound direction", () => {
      const m = repo.upsertMessage({
        platform: "x",
        platformMessageId: "out1",
        direction: "outbound",
        body: "sent"
      });
      expect(m.direction).toBe("outbound");
    });

    it("lists messages by thread oldest-first with paging", () => {
      const thread = repo.upsertThread({ platform: "x", platformThreadId: "tp" });
      for (let i = 0; i < 5; i++) {
        repo.upsertMessage({
          platform: "x",
          platformMessageId: `p${i}`,
          threadId: thread.id,
          body: `m${i}`
        });
      }
      const all = repo.listMessagesByThread(thread.id);
      expect(all.map((m) => m.body)).toEqual(["m0", "m1", "m2", "m3", "m4"]);
      const page = repo.listMessagesByThread(thread.id, 2, 1);
      expect(page.map((m) => m.body)).toEqual(["m1", "m2"]);
    });

    it("returns undefined for unknown messages and ignores malformed metadata", () => {
      expect(repo.getMessage(7)).toBeUndefined();
      expect(repo.getMessageByPlatformId("x", "no")).toBeUndefined();
      db.prepare(
        "INSERT INTO social_messages (platform, platform_message_id, body, metadata_json) VALUES (?,?,?,?)"
      ).run("x", "bad", "body", "{not json");
      expect(repo.getMessageByPlatformId("x", "bad")?.metadata).toBeUndefined();
    });
  });
});
