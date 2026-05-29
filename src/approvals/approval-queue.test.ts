import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApprovalQueue,
  ApprovalQueueFullError,
  type ApprovalOutcome,
  type PendingApproval
} from "./approval-queue.js";

interface DraftPayload {
  threadId: string;
  draft: string;
}

describe("ApprovalQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the decision when decide() is called before timeout", async () => {
    const queue = new ApprovalQueue<DraftPayload>();
    const promise = queue.request({ threadId: "t1", draft: "hi" }, { timeoutMs: 1000 });

    const [pending] = queue.list();
    expect(pending).toBeDefined();
    const settled = queue.decide(pending!.id, "approve", { reviewer: "matt" });
    expect(settled).toBe(true);

    const outcome = await promise;
    expect(outcome.decision).toBe("approve");
    expect(outcome.metadata).toEqual({ reviewer: "matt" });
    expect(outcome.id).toBe(pending!.id);
  });

  it("clears the timer when a decision settles before timeout (no late timeout)", async () => {
    const queue = new ApprovalQueue();
    const promise = queue.request({}, { timeoutMs: 1000 });
    const timeoutListener = vi.fn();
    queue.on("timeout", timeoutListener);

    const id = queue.list()[0]!.id;
    queue.decide(id, "reject");
    await promise;

    // Advancing past the original timeout must not fire a timeout event.
    vi.advanceTimersByTime(5000);
    expect(timeoutListener).not.toHaveBeenCalled();
    expect(queue.size).toBe(0);
  });

  it("resolves (not rejects) with { decision: 'timeout' } when the timeout elapses", async () => {
    const queue = new ApprovalQueue();
    const promise = queue.request({ note: "needs approval" }, { timeoutMs: 2000 });

    vi.advanceTimersByTime(2000);
    const outcome = await promise;

    expect(outcome.decision).toBe("timeout");
    expect(outcome.metadata).toBeUndefined();
    expect(queue.size).toBe(0);
  });

  it("treats a decision after timeout as a no-op (no double-settle, no throw)", async () => {
    const queue = new ApprovalQueue();
    const promise = queue.request({}, { timeoutMs: 1000 });

    vi.advanceTimersByTime(1000);
    const outcome = await promise;
    expect(outcome.decision).toBe("timeout");

    // Late decision on an already-timed-out request: idempotent no-op.
    const id = outcome.id;
    expect(queue.decide(id, "approve")).toBe(false);
    expect(queue.has(id)).toBe(false);
  });

  it("treats a double decision as a no-op (race-safe)", async () => {
    const queue = new ApprovalQueue();
    const promise = queue.request({});
    const id = queue.list()[0]!.id;

    expect(queue.decide(id, "approve")).toBe(true);
    expect(queue.decide(id, "reject")).toBe(false);

    const outcome = await promise;
    expect(outcome.decision).toBe("approve");
  });

  it("resolves multiple concurrent requests independently", async () => {
    const queue = new ApprovalQueue();
    const a = queue.request({ tag: "a" }, { timeoutMs: 1000 });
    const b = queue.request({ tag: "b" }, { timeoutMs: 5000 });
    const c = queue.request({ tag: "c" }, { timeoutMs: 1000 });

    expect(queue.size).toBe(3);
    const ids = queue.list().map((p) => p.id);

    queue.decide(ids[1]!, "approve"); // settle b explicitly
    vi.advanceTimersByTime(1000); // a and c time out, b already settled

    const [oa, ob, oc] = await Promise.all([a, b, c]);
    expect(oa.decision).toBe("timeout");
    expect(ob.decision).toBe("approve");
    expect(oc.decision).toBe("timeout");
    expect(queue.size).toBe(0);
  });

  it("waits indefinitely when no timeout is configured", async () => {
    const queue = new ApprovalQueue();
    const promise = queue.request({});
    const id = queue.list()[0]!.id;

    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(queue.has(id)).toBe(true);

    queue.decide(id, "approve");
    const outcome = await promise;
    expect(outcome.decision).toBe("approve");
  });

  it("applies the queue default timeout when a request omits one", async () => {
    const queue = new ApprovalQueue({ defaultTimeoutMs: 1500 });
    const promise = queue.request({});
    expect(queue.list()[0]!.timeoutMs).toBe(1500);

    vi.advanceTimersByTime(1500);
    expect((await promise).decision).toBe("timeout");
  });

  it("emits request, decision and timeout events", async () => {
    const queue = new ApprovalQueue();
    const onRequest = vi.fn<(p: PendingApproval) => void>();
    const onDecision = vi.fn<(o: ApprovalOutcome) => void>();
    const onTimeout = vi.fn<(o: ApprovalOutcome) => void>();
    queue.on("request", onRequest);
    queue.on("decision", onDecision);
    queue.on("timeout", onTimeout);

    const p1 = queue.request({ x: 1 });
    const id1 = queue.list()[0]!.id;
    queue.decide(id1, "approve");
    await p1;

    const p2 = queue.request({ x: 2 }, { timeoutMs: 100 });
    vi.advanceTimersByTime(100);
    await p2;

    expect(onRequest).toHaveBeenCalledTimes(2);
    expect(onDecision).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onDecision.mock.calls[0]![0].decision).toBe("approve");
    expect(onTimeout.mock.calls[0]![0].decision).toBe("timeout");
  });

  it("honours a caller-supplied id and rejects duplicates", () => {
    const queue = new ApprovalQueue();
    void queue.request({}, { id: "fixed-1" });
    expect(queue.get("fixed-1")).toBeDefined();
    expect(() => queue.request({}, { id: "fixed-1" })).toThrow(/already pending/);
  });

  it("decide() returns false for an unknown id", () => {
    const queue = new ApprovalQueue();
    expect(queue.decide("nope", "approve")).toBe(false);
  });

  it("clear() settles all pending requests as timeouts", async () => {
    const queue = new ApprovalQueue();
    const a = queue.request({});
    const b = queue.request({});
    expect(queue.size).toBe(2);

    queue.clear();
    expect(queue.size).toBe(0);
    expect((await a).decision).toBe("timeout");
    expect((await b).decision).toBe("timeout");
  });

  it("validates request options and decision values at the boundary", () => {
    const queue = new ApprovalQueue();
    // @ts-expect-error invalid decision
    expect(() => queue.decide("x", "maybe")).toThrow();
    expect(() => queue.request({}, { timeoutMs: -1 })).toThrow();
    expect(() => new ApprovalQueue({ defaultTimeoutMs: -5 })).toThrow();
  });

  it("uses an injected clock for createdAt / decidedAt", async () => {
    let t = 1000;
    const queue = new ApprovalQueue({ now: () => t });
    const promise = queue.request({});
    expect(queue.list()[0]!.createdAt).toBe(1000);
    t = 2000;
    queue.decide(queue.list()[0]!.id, "approve");
    expect((await promise).decidedAt).toBe(2000);
  });

  describe("maxPending cap", () => {
    it("throws ApprovalQueueFullError synchronously when at capacity", () => {
      const queue = new ApprovalQueue({ maxPending: 2 });
      void queue.request({}, { id: "a" });
      void queue.request({}, { id: "b" });
      expect(queue.size).toBe(2);

      expect(() => queue.request({}, { id: "c" })).toThrow(ApprovalQueueFullError);
      try {
        queue.request({}, { id: "c" });
      } catch (err) {
        expect(err).toBeInstanceOf(ApprovalQueueFullError);
        expect((err as ApprovalQueueFullError).maxPending).toBe(2);
        expect((err as Error).message).toMatch(/full/);
      }
      // The rejected request created no entry — no dangling promise / slot.
      expect(queue.size).toBe(2);
      expect(queue.has("c")).toBe(false);
    });

    it("accepts a new request again after a pending one is decided (slot freed)", async () => {
      const queue = new ApprovalQueue({ maxPending: 1 });
      const first = queue.request({}, { id: "a" });
      expect(() => queue.request({}, { id: "b" })).toThrow(ApprovalQueueFullError);

      queue.decide("a", "approve");
      expect((await first).decision).toBe("approve");

      // Slot freed → next request succeeds.
      expect(() => queue.request({}, { id: "b" })).not.toThrow();
      expect(queue.has("b")).toBe(true);
    });

    it("frees a slot when a pending request times out", async () => {
      const queue = new ApprovalQueue({ maxPending: 1 });
      const first = queue.request({}, { id: "a", timeoutMs: 1000 });
      expect(() => queue.request({}, { id: "b" })).toThrow(ApprovalQueueFullError);

      vi.advanceTimersByTime(1000);
      expect((await first).decision).toBe("timeout");

      expect(() => queue.request({}, { id: "b" })).not.toThrow();
      expect(queue.size).toBe(1);
    });

    it("is unbounded by default (existing behavior unchanged)", () => {
      const queue = new ApprovalQueue();
      for (let i = 0; i < 50; i++) void queue.request({}, { id: `r${i}` });
      expect(queue.size).toBe(50);
      expect(() => queue.request({}, { id: "r50" })).not.toThrow();
      expect(queue.size).toBe(51);
    });

    it("validates maxPending at construction", () => {
      expect(() => new ApprovalQueue({ maxPending: 0 })).toThrow();
      expect(() => new ApprovalQueue({ maxPending: -1 })).toThrow();
      expect(() => new ApprovalQueue({ maxPending: 1.5 })).toThrow();
    });
  });
});
