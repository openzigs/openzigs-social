/**
 * YouTube connector factory — unit tests (epic #58).
 *
 * Tests that recordFn fires on dispatch, and that the connector correctly
 * enqueues when quota is exhausted.
 */
import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../db/index.js";
import { OutboxRepository } from "../../outbox/repository.js";
import { WRITE_COST, READ_COST, YOUTUBE_DAILY_QUOTA, recordQuotaUsage } from "./quota.js";
import { createYoutubeConnector, nextUtcMidnight } from "./connector.js";

// ─────────────────────────── helpers ─────────────────────────────────────────

function build(db: Database, opts: { recordSpy?: (n: number) => void; now?: () => Date } = {}) {
  const outbox = new OutboxRepository(db);
  const recordFn = opts.recordSpy ?? vi.fn();
  const connector = createYoutubeConnector({
    db,
    outbox,
    recordFn,
    now: opts.now
  });
  return { connector, outbox, recordFn };
}

// ─────────────────────────── nextUtcMidnight ─────────────────────────────────

describe("nextUtcMidnight", () => {
  it("returns midnight UTC of the next calendar day", () => {
    const now = new Date("2025-03-15T14:30:00Z");
    const midnight = nextUtcMidnight(now);
    expect(midnight.toISOString()).toBe("2025-03-16T00:00:00.000Z");
  });

  it("handles midnight boundary (already at midnight UTC)", () => {
    const now = new Date("2025-03-15T00:00:00Z");
    const midnight = nextUtcMidnight(now);
    expect(midnight.toISOString()).toBe("2025-03-16T00:00:00.000Z");
  });

  it("handles month-end rollover", () => {
    const now = new Date("2025-01-31T23:59:59Z");
    const midnight = nextUtcMidnight(now);
    expect(midnight.toISOString()).toBe("2025-02-01T00:00:00.000Z");
  });

  it("handles year-end rollover", () => {
    const now = new Date("2025-12-31T12:00:00Z");
    const midnight = nextUtcMidnight(now);
    expect(midnight.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

// ─────────────────────────── connector dispatch ───────────────────────────────

describe("createYoutubeConnector — fetchComments", () => {
  let db: Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
  });

  afterEach(() => {
    db.close();
  });

  it("dispatches normally when quota is not exhausted", async () => {
    const recordSpy = vi.fn();
    const { connector } = build(db, { recordSpy });

    const result = await connector.fetchComments("vid-1");

    expect(result).toEqual({ queued: false });
    expect(recordSpy).toHaveBeenCalledOnce();
    expect(recordSpy).toHaveBeenCalledWith(READ_COST);
  });

  it("records READ_COST on every fetchComments call when not exhausted", async () => {
    const recordSpy = vi.fn();
    const { connector } = build(db, { recordSpy });

    await connector.fetchComments("vid-1");
    await connector.fetchComments("vid-2");

    expect(recordSpy).toHaveBeenCalledTimes(2);
    expect(recordSpy).toHaveBeenNthCalledWith(1, READ_COST);
    expect(recordSpy).toHaveBeenNthCalledWith(2, READ_COST);
  });

  it("enqueues without dispatching when quota is exhausted", async () => {
    // Fill to the limit.
    recordQuotaUsage(db, YOUTUBE_DAILY_QUOTA, "2025-01-15");
    const fixedNow = new Date("2025-01-15T18:00:00Z");
    const recordSpy = vi.fn();
    const { connector, outbox } = build(db, {
      recordSpy,
      now: () => fixedNow
    });

    const result = await connector.fetchComments("vid-1");

    expect(result.queued).toBe(true);
    if (result.queued) {
      expect(result.scheduledFor).toBe("2025-01-16T00:00:00.000Z");
    }
    // No quota units should have been recorded.
    expect(recordSpy).not.toHaveBeenCalled();

    // The outbox should have one pending job.
    const jobs = outbox.list({ platform: "youtube", status: "scheduled" });
    expect(jobs).toHaveLength(1);
    expect(JSON.parse(jobs[0]!.body)).toMatchObject({ action: "fetchComments", videoId: "vid-1" });
  });

  it("scheduledFor is the correct next-UTC-midnight ISO string", async () => {
    recordQuotaUsage(db, YOUTUBE_DAILY_QUOTA, "2025-06-30");
    const fixedNow = new Date("2025-06-30T23:00:00Z");
    const { connector } = build(db, { now: () => fixedNow });

    const result = await connector.fetchComments("vid-1");

    expect(result.queued).toBe(true);
    if (result.queued) {
      expect(result.scheduledFor).toBe("2025-07-01T00:00:00.000Z");
    }
  });
});

describe("createYoutubeConnector — replyToComment", () => {
  let db: Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
  });

  afterEach(() => {
    db.close();
  });

  it("dispatches normally and records WRITE_COST when quota is not exhausted", async () => {
    const recordSpy = vi.fn();
    const { connector } = build(db, { recordSpy });

    const result = await connector.replyToComment("cmt-1", "Thanks!");

    expect(result).toEqual({ queued: false });
    expect(recordSpy).toHaveBeenCalledOnce();
    expect(recordSpy).toHaveBeenCalledWith(WRITE_COST);
  });

  it("enqueues without recording when quota is exhausted", async () => {
    recordQuotaUsage(db, YOUTUBE_DAILY_QUOTA - 1, "2025-01-15"); // 9999 / 10000
    const fixedNow = new Date("2025-01-15T09:00:00Z");
    const recordSpy = vi.fn();
    const { connector, outbox } = build(db, {
      recordSpy,
      now: () => fixedNow
    });

    // WRITE_COST (50) > remaining (1) → exhausted.
    const result = await connector.replyToComment("cmt-1", "Hi");

    expect(result.queued).toBe(true);
    expect(recordSpy).not.toHaveBeenCalled();

    const jobs = outbox.list({ platform: "youtube", status: "scheduled" });
    expect(jobs).toHaveLength(1);
    expect(JSON.parse(jobs[0]!.body)).toMatchObject({
      action: "replyToComment",
      commentId: "cmt-1"
    });
  });
});
