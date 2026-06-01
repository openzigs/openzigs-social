import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../db/index.js";
import {
  AutoReplyAuditRepository,
  AuditNotFoundError,
  type AuditRecordInput
} from "./audit-repository.js";

function baseInput(overrides: Partial<AuditRecordInput> = {}): AuditRecordInput {
  return {
    threadId: "t-1",
    platform: "twitter",
    prompt: "hi there",
    draftText: "hello!",
    confidence: 0.9,
    voiceMatch: 0.85,
    toneMatch: 0.85,
    bannedHits: [],
    decision: "auto_send",
    ...overrides
  };
}

describe("AutoReplyAuditRepository", () => {
  let db: Database;
  let repo: AutoReplyAuditRepository;
  let clock: number;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    clock = 1000;
    repo = new AutoReplyAuditRepository(db, { now: () => clock });
  });

  afterEach(() => {
    db.close();
  });

  it("records and reads back a row with all fields", () => {
    const row = repo.record(
      baseInput({ contactId: "c-9", model: "gemma3:4b", bannedHits: ["spam"] })
    );
    expect(row.id).toBeGreaterThan(0);
    expect(row.threadId).toBe("t-1");
    expect(row.contactId).toBe("c-9");
    expect(row.model).toBe("gemma3:4b");
    expect(row.bannedHits).toEqual(["spam"]);
    expect(row.decision).toBe("auto_send");
    expect(row.outcome).toBe("pending");
    expect(row.humanOverride).toBe(false);
    expect(row.createdAt).toBe(1000);
    expect(repo.get(row.id)).toEqual(row);
  });

  it("defaults outcome to pending and omits optional fields when absent", () => {
    const row = repo.record(baseInput());
    expect(row.contactId).toBeUndefined();
    expect(row.finalText).toBeUndefined();
    expect(row.model).toBeUndefined();
  });

  it("finalizes a row's outcome and final text", () => {
    const row = repo.record(baseInput({ decision: "queue", outcome: "pending" }));
    clock = 2000;
    const done = repo.finalize(row.id, {
      outcome: "sent",
      finalText: "edited",
      humanOverride: true
    });
    expect(done.outcome).toBe("sent");
    expect(done.finalText).toBe("edited");
    expect(done.humanOverride).toBe(true);
    expect(done.updatedAt).toBe(2000);
  });

  it("preserves an existing override flag on a later finalize", () => {
    const row = repo.record(baseInput());
    repo.finalize(row.id, { outcome: "sent", humanOverride: true });
    const again = repo.finalize(row.id, { outcome: "sent" });
    expect(again.humanOverride).toBe(true);
  });

  it("throws when finalizing a missing row", () => {
    expect(() => repo.finalize(999, { outcome: "sent" })).toThrow(AuditNotFoundError);
  });

  it("lists newest-first and filters by thread", () => {
    repo.record(baseInput({ threadId: "a" }));
    clock = 1100;
    repo.record(baseInput({ threadId: "b" }));
    clock = 1200;
    repo.record(baseInput({ threadId: "a" }));
    const all = repo.list();
    expect(all).toHaveLength(3);
    expect(all[0].createdAt).toBe(1200);
    const threadA = repo.list({ threadId: "a" });
    expect(threadA).toHaveLength(2);
    expect(threadA.every((r) => r.threadId === "a")).toBe(true);
  });

  it("filters by time range", () => {
    repo.record(baseInput());
    clock = 5000;
    repo.record(baseInput());
    expect(repo.list({ since: 4000 })).toHaveLength(1);
    expect(repo.list({ until: 2000 })).toHaveLength(1);
    expect(repo.list({ since: 1000, until: 5000 })).toHaveLength(2);
  });

  it("normalises a non-positive limit to the default rather than unbounded", () => {
    for (let i = 0; i < 3; i++) repo.record(baseInput());
    expect(repo.list({ limit: -1 })).toHaveLength(3);
    expect(repo.list({ limit: Number.NaN })).toHaveLength(3);
    expect(repo.list({ limit: 2 })).toHaveLength(2);
  });

  it("deletes a contact's rows (right-to-delete cascade)", () => {
    repo.record(baseInput({ contactId: "c-1" }));
    repo.record(baseInput({ contactId: "c-1" }));
    repo.record(baseInput({ contactId: "c-2" }));
    const removed = repo.deleteByContact("c-1");
    expect(removed).toBe(2);
    expect(repo.list()).toHaveLength(1);
    expect(repo.list()[0].contactId).toBe("c-2");
  });

  it("survives a fresh connection to the same file (WAL persistence)", () => {
    expect(repo.get(1)).toBeUndefined();
  });
});
