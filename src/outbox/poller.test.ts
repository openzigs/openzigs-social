/**
 * Tests for the outbox poller (#86) — claim → publish, then either publish,
 * re-queue via `publish_at` (non-blocking retry), or dead-letter (#89).
 *
 * The retry mechanism is deliberately *across-tick*: a failed publish never
 * sleeps inside the tick. It is re-queued (`publishing → scheduled`) with a
 * future `publish_at`, so one persistently failing post can never starve the
 * other due posts in the same tick.
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

beforeEach(() => {
  db = openDb({ path: ":memory:" });
  clock = 1_000_000;
  repo = new OutboxRepository(db, { now: () => clock });
  dlq = new DlqRepository(db);
  dispatch = new OutboxDispatch();
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
    ...overrides
  });
}

describe("tick — happy path", () => {
  it("claims due posts and publishes them within the tick", async () => {
    dispatch.register("twitter", { publish: vi.fn().mockResolvedValue({ externalId: "t-1" }) });
    const post = repo.create({ platform: "twitter", body: "hi", publishAt: 500_000 });

    const result = await makePoller().tick();

    expect(result).toEqual({ claimed: 1, published: 1, requeued: 0, failed: 0 });
    const stored = repo.get(post.id);
    expect(stored?.status).toBe("published");
    expect(stored?.externalId).toBe("t-1");
  });

  it("does nothing when no posts are due", async () => {
    repo.create({ platform: "twitter", body: "later", publishAt: 9_000_000 });
    const result = await makePoller().tick();
    expect(result).toEqual({ claimed: 0, published: 0, requeued: 0, failed: 0 });
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

describe("tick — non-blocking re-queue + dead-letter", () => {
  it("re-queues a transient failure with publish_at = now + 1m and attempts=1", async () => {
    const publish = vi.fn().mockRejectedValue(new Error("boom"));
    dispatch.register("twitter", { publish } satisfies OutboxPublisher);
    const post = repo.create({ platform: "twitter", body: "hi", publishAt: 500_000 });

    const result = await makePoller().tick();

    // A single attempt per tick — no in-tick looping over retries.
    expect(publish).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ claimed: 1, published: 0, requeued: 1, failed: 0 });

    const stored = repo.get(post.id);
    expect(stored?.status).toBe("scheduled");
    expect(stored?.attempts).toBe(1);
    expect(stored?.publishAt).toBe(clock + OUTBOX_RETRY_SCHEDULE_MS[0]!);
    expect(stored?.lastError).toBe("boom");
  });

  it("walks the exact 1m/5m/30m/2h publish_at offsets across successive ticks", async () => {
    const publish = vi.fn().mockRejectedValue(new Error("nope"));
    dispatch.register("twitter", { publish } satisfies OutboxPublisher);
    const post = repo.create({ platform: "twitter", body: "hi", publishAt: 500_000 });
    const poller = makePoller();

    for (let i = 0; i < OUTBOX_RETRY_SCHEDULE_MS.length; i++) {
      const tickAt = clock;
      const result = await poller.tick();
      expect(result.requeued).toBe(1);
      expect(result.failed).toBe(0);
      const stored = repo.get(post.id);
      expect(stored?.status).toBe("scheduled");
      expect(stored?.attempts).toBe(i + 1);
      expect(stored?.publishAt).toBe(tickAt + OUTBOX_RETRY_SCHEDULE_MS[i]!);
      // Advance the clock past this slot so the row is due on the next tick.
      clock = stored!.publishAt!;
    }

    // Fifth attempt (schedule exhausted) → dead-letter.
    const final = await poller.tick();
    expect(final).toEqual({ claimed: 1, published: 0, requeued: 0, failed: 1 });
    expect(publish).toHaveBeenCalledTimes(OUTBOX_RETRY_SCHEDULE_MS.length + 1);
    const dead = repo.get(post.id);
    expect(dead?.status).toBe("failed");
    expect(dead?.attempts).toBe(OUTBOX_RETRY_SCHEDULE_MS.length + 1);
    expect(dead?.lastError).toBe("nope");

    const landed = dlq.list({ platform: "twitter" });
    expect(landed).toHaveLength(1);
    expect(landed[0]?.opKind).toBe("outbox.publish");
    expect(landed[0]?.lastError).toBe("nope");
  });

  it("does not sleep inside the tick — a failing post settles promptly", async () => {
    vi.useFakeTimers();
    try {
      dispatch.register("twitter", { publish: vi.fn().mockRejectedValue(new Error("slow?")) });
      repo.create({ platform: "twitter", body: "hi", publishAt: 500_000 });

      // If the tick awaited any backoff delay it would never settle without
      // advancing fake timers. It must resolve with no pending timers.
      const result = await makePoller().tick();

      expect(result.requeued).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits an outbox:retry event on re-queue and outbox:failed on dead-letter", async () => {
    dispatch.register("twitter", { publish: vi.fn().mockRejectedValue(new Error("x")) });
    const post = repo.create({ platform: "twitter", body: "hi", publishAt: 500_000 });
    const emit = vi.fn();
    const poller = makePoller({ emit });

    await poller.tick();
    expect(emit).toHaveBeenCalledWith(
      "outbox:retry",
      expect.objectContaining({ id: post.id, attempts: 1, lastError: "x" })
    );

    // Exhaust the schedule, then assert the dead-letter event.
    for (let i = 0; i < OUTBOX_RETRY_SCHEDULE_MS.length; i++) {
      clock = repo.get(post.id)!.publishAt!;
      await poller.tick();
    }
    expect(emit).toHaveBeenCalledWith(
      "outbox:failed",
      expect.objectContaining({ dlqId: expect.any(Number), lastError: "x" })
    );
  });

  it("recovers if a later tick succeeds", async () => {
    const publish = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ externalId: "ok-2" });
    dispatch.register("twitter", { publish });
    const post = repo.create({ platform: "twitter", body: "hi", publishAt: 500_000 });
    const poller = makePoller();

    const first = await poller.tick();
    expect(first.requeued).toBe(1);
    expect(repo.get(post.id)?.status).toBe("scheduled");

    clock = repo.get(post.id)!.publishAt!;
    const second = await poller.tick();

    expect(publish).toHaveBeenCalledTimes(2);
    expect(second.published).toBe(1);
    expect(repo.get(post.id)?.status).toBe("published");
  });

  it("dead-letters a non-transient error immediately without re-queueing", async () => {
    const publish = vi.fn().mockRejectedValue(new Error("4xx"));
    dispatch.register("twitter", { publish });
    const post = repo.create({ platform: "twitter", body: "hi", publishAt: 500_000 });

    const result = await makePoller({ isTransient: () => false }).tick();

    expect(publish).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ claimed: 1, published: 0, requeued: 0, failed: 1 });
    expect(repo.get(post.id)?.status).toBe("failed");
    expect(dlq.list({ platform: "twitter" })).toHaveLength(1);
  });

  it("dead-letters a post whose platform has no publisher", async () => {
    const post = repo.create({ platform: "tiktok", body: "hi", publishAt: 500_000 });
    const result = await makePoller().tick();
    expect(result.failed).toBe(1);
    expect(repo.get(post.id)?.status).toBe("failed");
    expect(dlq.list({ platform: "tiktok" })).toHaveLength(1);
  });
});

describe("tick — starvation regression (#84 AC1)", () => {
  it("a persistently failing post does NOT block other due posts in the same tick", async () => {
    // Post A always fails; post B always succeeds. Both are due in this tick.
    dispatch
      .register("twitter", { publish: vi.fn().mockRejectedValue(new Error("A-down")) })
      .register("linkedin", { publish: vi.fn().mockResolvedValue({ externalId: "B-1" }) });
    const a = repo.create({ platform: "twitter", body: "A", publishAt: 400_000 });
    const b = repo.create({ platform: "linkedin", body: "B", publishAt: 500_000 });

    const poller = makePoller();
    const result = await poller.tick();

    // B published in THIS tick — A's failure never starved it.
    expect(result).toEqual({ claimed: 2, published: 1, requeued: 1, failed: 0 });
    expect(repo.get(b.id)?.status).toBe("published");

    // A was re-queued, not blocking: scheduled with publish_at ≈ now + 1m.
    const storedA = repo.get(a.id);
    expect(storedA?.status).toBe("scheduled");
    expect(storedA?.attempts).toBe(1);
    expect(storedA?.publishAt).toBe(clock + OUTBOX_RETRY_SCHEDULE_MS[0]!);

    // Advancing the clock re-ticks A on schedule; it eventually dead-letters
    // into outbox_dlq after the final 2h step — never having blocked B.
    for (let i = 1; i < OUTBOX_RETRY_SCHEDULE_MS.length; i++) {
      clock = repo.get(a.id)!.publishAt!;
      const r = await poller.tick();
      expect(r.requeued).toBe(1);
      expect(repo.get(a.id)?.attempts).toBe(i + 1);
    }
    clock = repo.get(a.id)!.publishAt!;
    const last = await poller.tick();
    expect(last.failed).toBe(1);
    expect(repo.get(a.id)?.status).toBe("failed");
    expect(dlq.list({ platform: "twitter" })).toHaveLength(1);
  });
});
