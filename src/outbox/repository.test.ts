/**
 * Tests for the outbox repository + state machine (#85).
 */
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb } from "../db/index.js";
import {
  IllegalTransitionError,
  OUTBOX_TRANSITIONS,
  OutboxNotFoundError,
  OutboxRepository,
  canTransition,
  type OutboxStatus
} from "./repository.js";

let db: Database.Database;
let clock: number;
let repo: OutboxRepository;

beforeEach(() => {
  db = openDb({ path: ":memory:" });
  clock = 1_000_000;
  repo = new OutboxRepository(db, { now: () => clock });
});

afterEach(() => {
  closeDb();
});

describe("canTransition / OUTBOX_TRANSITIONS", () => {
  it("permits exactly the documented edges", () => {
    expect(canTransition("draft", "scheduled")).toBe(true);
    expect(canTransition("scheduled", "publishing")).toBe(true);
    expect(canTransition("scheduled", "draft")).toBe(true);
    expect(canTransition("publishing", "published")).toBe(true);
    expect(canTransition("publishing", "failed")).toBe(true);
    expect(canTransition("failed", "scheduled")).toBe(true);
  });

  it("rejects illegal edges", () => {
    expect(canTransition("draft", "publishing")).toBe(false);
    expect(canTransition("draft", "published")).toBe(false);
    expect(canTransition("published", "scheduled")).toBe(false);
    expect(canTransition("scheduled", "published")).toBe(false);
    expect(canTransition("failed", "publishing")).toBe(false);
  });

  it("treats published as terminal", () => {
    expect(OUTBOX_TRANSITIONS.published).toEqual([]);
  });
});

describe("create", () => {
  it("creates a draft when no publishAt is given", () => {
    const post = repo.create({ platform: "twitter", body: "hi" });
    expect(post.status).toBe("draft");
    expect(post.publishAt).toBeUndefined();
    expect(post.attempts).toBe(0);
    expect(post.createdAt).toBe(clock);
    expect(post.updatedAt).toBe(clock);
  });

  it("creates a scheduled post when publishAt is given", () => {
    const post = repo.create({ platform: "twitter", body: "hi", publishAt: 2_000_000 });
    expect(post.status).toBe("scheduled");
    expect(post.publishAt).toBe(2_000_000);
  });

  it("persists media as JSON and round-trips it", () => {
    const post = repo.create({
      platform: "twitter",
      body: "hi",
      media: [{ url: "https://x/y.png", type: "image/png", altText: "alt", bytes: 10 }]
    });
    expect(post.media).toEqual([
      { url: "https://x/y.png", type: "image/png", altText: "alt", bytes: 10 }
    ]);
  });

  it("defaults body to empty string", () => {
    const post = repo.create({ platform: "twitter" });
    expect(post.body).toBe("");
    expect(post.media).toEqual([]);
  });
});

describe("get / list", () => {
  it("returns undefined for a missing id", () => {
    expect(repo.get(999)).toBeUndefined();
  });

  it("falls back to bounded pagination for invalid limits", () => {
    for (let i = 0; i < 201; i++) {
      repo.create({ platform: "twitter", body: `post-${i}` });
    }

    expect(repo.list({ limit: -1 })).toHaveLength(200);
    expect(repo.list({ limit: Number.NaN })).toHaveLength(200);
  });

  it("filters by status array, platform, and date range", () => {
    repo.create({ platform: "twitter", body: "a", publishAt: 1000 });
    repo.create({ platform: "linkedin", body: "b", publishAt: 5000 });
    const draft = repo.create({ platform: "twitter", body: "c" });

    expect(repo.list({ platform: "twitter" })).toHaveLength(2);
    expect(repo.list({ status: "draft" }).map((p) => p.id)).toEqual([draft.id]);
    expect(repo.list({ status: ["scheduled"], platform: "linkedin" })).toHaveLength(1);
    expect(repo.list({ from: 2000, to: 6000 }).map((p) => p.body)).toEqual(["b"]);
  });

  it("orders by publish time then id", () => {
    const later = repo.create({ platform: "twitter", body: "later", publishAt: 9000 });
    const sooner = repo.create({ platform: "twitter", body: "sooner", publishAt: 1000 });
    expect(repo.list({ status: "scheduled" }).map((p) => p.id)).toEqual([sooner.id, later.id]);
  });
});

describe("update", () => {
  it("edits body/media/account for a draft", () => {
    const post = repo.create({ platform: "twitter", body: "old" });
    clock += 50;
    const updated = repo.update(post.id, { body: "new", accountId: "acct-1" });
    expect(updated.body).toBe("new");
    expect(updated.accountId).toBe("acct-1");
    expect(updated.updatedAt).toBe(clock);
  });

  it("rejects editing a publishing or published post", () => {
    const post = repo.create({ platform: "twitter", body: "x", publishAt: 1000 });
    repo.claimDue(2000, 10);
    expect(() => repo.update(post.id, { body: "no" })).toThrow(IllegalTransitionError);
  });

  it("throws OutboxNotFoundError for a missing id", () => {
    expect(() => repo.update(999, { body: "x" })).toThrow(OutboxNotFoundError);
  });
});

describe("schedule / unschedule", () => {
  it("schedules a draft and unschedules it back", () => {
    const draft = repo.create({ platform: "twitter", body: "x" });
    const scheduled = repo.schedule(draft.id, 4000);
    expect(scheduled.status).toBe("scheduled");
    expect(scheduled.publishAt).toBe(4000);

    const back = repo.unschedule(draft.id);
    expect(back.status).toBe("draft");
    expect(back.publishAt).toBeUndefined();
  });
});

describe("reschedule (drag-to-reschedule)", () => {
  it("moves publish_at but keeps platform and status", () => {
    const post = repo.create({ platform: "linkedin", body: "x", publishAt: 1000 });
    const moved = repo.reschedule(post.id, 8000);
    expect(moved.publishAt).toBe(8000);
    expect(moved.platform).toBe("linkedin");
    expect(moved.status).toBe("scheduled");
  });

  it("requeues a failed post and clears the error", () => {
    const post = repo.create({ platform: "twitter", body: "x", publishAt: 1000 });
    repo.claimDue(2000, 10);
    repo.markFailed(post.id, "boom");
    const moved = repo.reschedule(post.id, 9000);
    expect(moved.status).toBe("scheduled");
    expect(moved.publishAt).toBe(9000);
    expect(moved.lastError).toBeUndefined();
  });

  it("rejects rescheduling a draft or published post", () => {
    const draft = repo.create({ platform: "twitter", body: "x" });
    expect(() => repo.reschedule(draft.id, 5000)).toThrow(IllegalTransitionError);
  });
});

describe("claimDue (atomic claim)", () => {
  it("claims only due scheduled rows and flips them to publishing", () => {
    const due = repo.create({ platform: "twitter", body: "due", publishAt: 1000 });
    repo.create({ platform: "twitter", body: "future", publishAt: 9999 });
    repo.create({ platform: "twitter", body: "draft" });

    const claimed = repo.claimDue(2000, 10);
    expect(claimed.map((p) => p.id)).toEqual([due.id]);
    expect(claimed[0]?.status).toBe("publishing");
    expect(claimed[0]?.attempts).toBe(1);
  });

  it("never claims the same row twice across overlapping ticks", () => {
    repo.create({ platform: "twitter", body: "a", publishAt: 1000 });
    repo.create({ platform: "twitter", body: "b", publishAt: 1000 });

    const first = repo.claimDue(2000, 10);
    const second = repo.claimDue(2000, 10);
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(0);
  });

  it("respects the batch limit", () => {
    for (let i = 0; i < 5; i++)
      repo.create({ platform: "twitter", body: `p${i}`, publishAt: 1000 });
    expect(repo.claimDue(2000, 2)).toHaveLength(2);
    expect(repo.list({ status: "scheduled" })).toHaveLength(3);
  });
});

describe("markPublished / markFailed", () => {
  it("marks a publishing post published with an external id", () => {
    const post = repo.create({ platform: "twitter", body: "x", publishAt: 1000 });
    repo.claimDue(2000, 10);
    clock += 100;
    const published = repo.markPublished(post.id, "tweet-123");
    expect(published.status).toBe("published");
    expect(published.externalId).toBe("tweet-123");
    expect(published.publishedAt).toBe(clock);
  });

  it("marks a publishing post failed with the error and attempts", () => {
    const post = repo.create({ platform: "twitter", body: "x", publishAt: 1000 });
    repo.claimDue(2000, 10);
    const failed = repo.markFailed(post.id, "rate limited", 5);
    expect(failed.status).toBe("failed");
    expect(failed.lastError).toBe("rate limited");
    expect(failed.attempts).toBe(5);
  });

  it("rejects publishing a row that was never claimed", () => {
    const post = repo.create({ platform: "twitter", body: "x", publishAt: 1000 });
    expect(() => repo.markPublished(post.id)).toThrow(IllegalTransitionError);
  });
});

describe("requeueForRetry (non-blocking backoff)", () => {
  it("re-queues a publishing post to scheduled with a future publish_at + error", () => {
    const post = repo.create({ platform: "twitter", body: "x", publishAt: 1000 });
    repo.claimDue(2000, 10);
    const requeued = repo.requeueForRetry(post.id, 60_000, "transient");
    expect(requeued.status).toBe("scheduled");
    expect(requeued.publishAt).toBe(60_000);
    expect(requeued.lastError).toBe("transient");
    // attempts is owned by claimDue, not touched here.
    expect(requeued.attempts).toBe(1);
  });

  it("permits publishing → scheduled as a legal edge", () => {
    expect(canTransition("publishing", "scheduled")).toBe(true);
  });

  it("rejects re-queueing a row that is not publishing", () => {
    const post = repo.create({ platform: "twitter", body: "x", publishAt: 1000 });
    expect(() => repo.requeueForRetry(post.id, 60_000, "no")).toThrow(IllegalTransitionError);
  });
});

describe("retry / delete", () => {
  it("requeues a failed post to scheduled", () => {
    const post = repo.create({ platform: "twitter", body: "x", publishAt: 1000 });
    repo.claimDue(2000, 10);
    repo.markFailed(post.id, "boom");
    const retried = repo.retry(post.id, 5000);
    expect(retried.status).toBe("scheduled");
    expect(retried.publishAt).toBe(5000);
    expect(retried.lastError).toBeUndefined();
  });

  it("deletes a post", () => {
    const post = repo.create({ platform: "twitter", body: "x" });
    expect(repo.delete(post.id)).toBe(true);
    expect(repo.get(post.id)).toBeUndefined();
    expect(repo.delete(post.id)).toBe(false);
  });
});

describe("transition", () => {
  it("rejects every illegal transition", () => {
    const post = repo.create({ platform: "twitter", body: "x" });
    const illegalTargets: OutboxStatus[] = ["publishing", "published", "failed"];
    for (const to of illegalTargets) {
      expect(() => repo.transition(post.id, to)).toThrow(IllegalTransitionError);
    }
  });
});

describe("persistence across reopen", () => {
  it("retains rows when the database is reopened from a file", () => {
    const tmp = `${process.env.TMPDIR ?? "/tmp"}/outbox-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.db`;
    closeDb();
    const fileDb = openDb({ path: tmp });
    const fileRepo = new OutboxRepository(fileDb);
    const created = fileRepo.create({ platform: "twitter", body: "persist", publishAt: 1000 });
    closeDb();

    const reopened = openDb({ path: tmp });
    const reopenedRepo = new OutboxRepository(reopened);
    const found = reopenedRepo.get(created.id);
    expect(found?.body).toBe("persist");
    expect(found?.status).toBe("scheduled");
  });
});
