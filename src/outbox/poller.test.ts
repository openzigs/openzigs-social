/**
 * Tests for the outbox poller (#86) — claim → publish → retry/DLQ (#89).
 */
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, openDb } from "../db/index.js";
import { DlqRepository } from "../platform/retry/dlq.js";
import { OutboxDispatch, type OutboxPublisher } from "./dispatch.js";
import { OUTBOX_RETRY_SCHEDULE_MS, OutboxPoller } from "./poller.js";
import { OutboxRepository } from "./repository.js";

let db: Database.Database;
let repo: OutboxRepository;
let dlq: DlqRepository;
let dispatch: OutboxDispatch;
let clock: number;
let sleeps: number[];

beforeEach(() => {
  db = openDb({ path: ":memory:" });
  clock = 1_000_000;
  repo = new OutboxRepository(db, { now: () => clock });
  dlq = new DlqRepository(db);
  dispatch = new OutboxDispatch();
  sleeps = [];
});

afterEach(() => {
  closeDb();
});

function makePoller(overrides: Partial<ConstructorParameters<typeof OutboxPoller>[0]> = {}) {
  return new OutboxPoller({
    repo,
    dispatch,
    dlq,
    now: () => clock,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    ...overrides
  });
}

describe("tick — happy path", () => {
  it("claims due posts and publishes them within the tick", async () => {
    dispatch.register("twitter", { publish: vi.fn().mockResolvedValue({ externalId: "t-1" }) });
    const post = repo.create({ platform: "twitter", body: "hi", publishAt: 500_000 });

    const result = await makePoller().tick();

    expect(result).toEqual({ claimed: 1, published: 1, failed: 0 });
    const stored = repo.get(post.id);
    expect(stored?.status).toBe("published");
    expect(stored?.externalId).toBe("t-1");
  });

  it("does nothing when no posts are due", async () => {
    repo.create({ platform: "twitter", body: "later", publishAt: 9_000_000 });
    const result = await makePoller().tick();
    expect(result).toEqual({ claimed: 0, published: 0, failed: 0 });
  });

  it("emits an outbox:published event", async () => {
    dispatch.register("twitter", { publish: vi.fn().mockResolvedValue({ externalId: "t-9" }) });
    repo.create({ platform: "twitter", body: "hi", publishAt: 500_000 });
    const emit = vi.fn();
    await makePoller({ emit }).tick();
    expect(emit).toHaveBeenCalledWith(
      "outbox:published",
      expect.objectContaining({ externalId: "t-9" })
    );
  });
});

describe("tick — retry schedule + dead-letter", () => {
  it("retries on the 1m/5m/30m/2h schedule then dead-letters", async () => {
    const publish = vi.fn().mockRejectedValue(new Error("boom"));
    dispatch.register("twitter", { publish } satisfies OutboxPublisher);
    const post = repo.create({ platform: "twitter", body: "hi", publishAt: 500_000 });

    const result = await makePoller().tick();

    // 5 attempts total, 4 retries on the mandated schedule.
    expect(publish).toHaveBeenCalledTimes(5);
    expect(sleeps).toEqual([...OUTBOX_RETRY_SCHEDULE_MS]);
    expect(result).toEqual({ claimed: 1, published: 0, failed: 1 });

    const stored = repo.get(post.id);
    expect(stored?.status).toBe("failed");
    expect(stored?.lastError).toBe("boom");
  });

  it("lands the terminal failure in outbox_dlq", async () => {
    dispatch.register("twitter", { publish: vi.fn().mockRejectedValue(new Error("nope")) });
    repo.create({ platform: "twitter", body: "hi", publishAt: 500_000 });

    await makePoller().tick();

    const landed = dlq.list({ platform: "twitter" });
    expect(landed).toHaveLength(1);
    expect(landed[0]?.opKind).toBe("outbox.publish");
    expect(landed[0]?.lastError).toBe("nope");
  });

  it("emits an outbox:failed event with the dlq id", async () => {
    dispatch.register("twitter", { publish: vi.fn().mockRejectedValue(new Error("x")) });
    repo.create({ platform: "twitter", body: "hi", publishAt: 500_000 });
    const emit = vi.fn();
    await makePoller({ emit }).tick();
    expect(emit).toHaveBeenCalledWith(
      "outbox:failed",
      expect.objectContaining({ dlqId: expect.any(Number), lastError: "x" })
    );
  });

  it("recovers if a retry eventually succeeds", async () => {
    const publish = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ externalId: "ok-2" });
    dispatch.register("twitter", { publish });
    const post = repo.create({ platform: "twitter", body: "hi", publishAt: 500_000 });

    const result = await makePoller().tick();

    expect(publish).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([OUTBOX_RETRY_SCHEDULE_MS[0]]);
    expect(result.published).toBe(1);
    expect(repo.get(post.id)?.status).toBe("published");
  });

  it("does not retry a non-transient error", async () => {
    const publish = vi.fn().mockRejectedValue(new Error("4xx"));
    dispatch.register("twitter", { publish });
    repo.create({ platform: "twitter", body: "hi", publishAt: 500_000 });

    await makePoller({ isTransient: () => false }).tick();

    expect(publish).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("dead-letters a post whose platform has no publisher", async () => {
    const post = repo.create({ platform: "tiktok", body: "hi", publishAt: 500_000 });
    const result = await makePoller().tick();
    expect(result.failed).toBe(1);
    expect(repo.get(post.id)?.status).toBe("failed");
    expect(dlq.list({ platform: "tiktok" })).toHaveLength(1);
  });
});
