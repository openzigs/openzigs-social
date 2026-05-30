import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../db/index.js";
import { SocialBrainRepository } from "../platform/social-brain/repository.js";
import { buildMatchExpression, InboxRepository } from "./repository.js";

describe("buildMatchExpression", () => {
  it("wraps each term as a quoted prefix token", () => {
    expect(buildMatchExpression("hello world")).toBe('"hello"* "world"*');
  });

  it("escapes embedded double quotes and ignores empty input", () => {
    expect(buildMatchExpression('say "hi"')).toBe('"say"* """hi"""*');
    expect(buildMatchExpression("   ")).toBeUndefined();
  });
});

describe("InboxRepository", () => {
  let db: Database;
  let brain: SocialBrainRepository;
  let inbox: InboxRepository;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    brain = new SocialBrainRepository(db);
    inbox = new InboxRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function seedThread(opts: {
    platform: string;
    threadId: string;
    handle: string;
    body: string;
    kind?: "dm" | "comment";
    sentAt?: string;
    priority?: string;
  }) {
    const contact = brain.upsertContact({
      platform: opts.platform,
      platformContactId: `c-${opts.threadId}`,
      handle: opts.handle
    });
    const thread = brain.upsertThread({
      platform: opts.platform,
      platformThreadId: opts.threadId,
      contactId: contact.id,
      lastMessageAt: opts.sentAt
    });
    const msg = brain.upsertMessage({
      platform: opts.platform,
      platformMessageId: `m-${opts.threadId}`,
      threadId: thread.id,
      contactId: contact.id,
      direction: "inbound",
      body: opts.body,
      metadata: { kind: opts.kind ?? "dm" },
      sentAt: opts.sentAt
    });
    if (opts.priority) {
      db.prepare(
        "INSERT INTO inbox_thread_state (thread_id, priority, updated_at) VALUES (?, ?, datetime('now'))"
      ).run(thread.id, opts.priority);
    }
    return { contact, thread, msg };
  }

  it("aggregates threads across platforms ordered by priority then recency", () => {
    seedThread({
      platform: "instagram",
      threadId: "t1",
      handle: "alice",
      body: "first",
      sentAt: "2026-01-01T00:00:00Z"
    });
    seedThread({
      platform: "linkedin",
      threadId: "t2",
      handle: "bob",
      body: "second",
      sentAt: "2026-01-03T00:00:00Z"
    });
    seedThread({
      platform: "facebook",
      threadId: "t3",
      handle: "carol",
      body: "third",
      sentAt: "2026-01-02T00:00:00Z",
      priority: "urgent"
    });

    const threads = inbox.listThreads();
    expect(threads.map((t) => t.platformThreadId)).toEqual(["t3", "t2", "t1"]);
    expect(threads[0].priority).toBe("urgent");
    expect(threads[0].contact?.handle).toBe("carol");
  });

  it("computes unread counts and clears them after markRead", () => {
    const { thread } = seedThread({
      platform: "instagram",
      threadId: "t1",
      handle: "alice",
      body: "unread one",
      sentAt: "2026-01-01T00:00:00Z"
    });
    brain.upsertMessage({
      platform: "instagram",
      platformMessageId: "m-extra",
      threadId: thread.id,
      direction: "inbound",
      body: "unread two",
      sentAt: "2026-01-02T00:00:00Z"
    });

    expect(inbox.listThreads()[0].unreadCount).toBe(2);
    inbox.markRead(thread.id, "2026-02-01T00:00:00Z");
    expect(inbox.listThreads()[0].unreadCount).toBe(0);
  });

  it("filters by platform and contact", () => {
    seedThread({ platform: "instagram", threadId: "t1", handle: "alice", body: "hi" });
    const { contact } = seedThread({
      platform: "linkedin",
      threadId: "t2",
      handle: "bob",
      body: "yo"
    });

    expect(inbox.listThreads({ platform: "linkedin" }).map((t) => t.platformThreadId)).toEqual([
      "t2"
    ]);
    expect(inbox.listThreads({ contactId: contact.id }).map((t) => t.platformThreadId)).toEqual([
      "t2"
    ]);
  });

  it("supports full-text search over message bodies (hits and misses)", () => {
    seedThread({
      platform: "instagram",
      threadId: "t1",
      handle: "alice",
      body: "where is my refund please"
    });
    seedThread({ platform: "instagram", threadId: "t2", handle: "bob", body: "love your content" });

    expect(inbox.listThreads({ search: "refund" }).map((t) => t.platformThreadId)).toEqual(["t1"]);
    expect(inbox.listThreads({ search: "refun" }).map((t) => t.platformThreadId)).toEqual(["t1"]); // prefix
    expect(inbox.listThreads({ search: "nonexistentword" })).toHaveLength(0);
  });

  it("reads a thread split into DM and comment sections", () => {
    const { thread } = seedThread({
      platform: "instagram",
      threadId: "t1",
      handle: "alice",
      body: "a dm",
      kind: "dm"
    });
    brain.upsertMessage({
      platform: "instagram",
      platformMessageId: "m-comment",
      threadId: thread.id,
      direction: "inbound",
      body: "a comment",
      metadata: { kind: "comment" }
    });

    const detail = inbox.getThread(thread.id);
    expect(detail?.dmSupported).toBe(true);
    expect(detail?.dms.map((m) => m.body)).toContain("a dm");
    expect(detail?.comments.map((m) => m.body)).toContain("a comment");
  });

  it("hides the DM section for comments-only platforms (LinkedIn)", () => {
    const { thread } = seedThread({
      platform: "linkedin",
      threadId: "t1",
      handle: "bob",
      body: "a comment",
      kind: "comment"
    });
    // Even a stray DM-kind row must not surface for LinkedIn.
    brain.upsertMessage({
      platform: "linkedin",
      platformMessageId: "m-stray-dm",
      threadId: thread.id,
      direction: "inbound",
      body: "stray dm",
      metadata: { kind: "dm" }
    });

    const detail = inbox.getThread(thread.id);
    expect(detail?.dmSupported).toBe(false);
    expect(detail?.dms).toEqual([]);
    expect(detail?.comments.map((m) => m.body)).toContain("a comment");
  });

  it("returns undefined for an unknown thread", () => {
    expect(inbox.getThread(999)).toBeUndefined();
  });
});
