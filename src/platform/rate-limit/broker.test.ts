import { describe, expect, it } from "vitest";

import { RateLimitBroker, type RateLimitWarning } from "./broker.js";

/** A controllable clock + sleep pair driving deterministic time. */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    }
  };
}

describe("RateLimitBroker", () => {
  it("grants while tokens remain and reports unknown platforms", async () => {
    const clock = fakeClock();
    const broker = new RateLimitBroker({
      budgets: { x: { capacity: 2, refillPerSec: 1 } },
      now: clock.now,
      sleep: clock.sleep
    });
    expect(await broker.acquire("x")).toEqual({ granted: true });
    expect(await broker.acquire("x")).toEqual({ granted: true });
    expect(broker.has("x")).toBe(true);
    expect(await broker.acquire("nope")).toEqual({
      granted: false,
      reason: "unknown-platform"
    });
  });

  it("awaits a refill instead of tight-looping, then grants", async () => {
    const clock = fakeClock();
    const broker = new RateLimitBroker({
      budgets: { x: { capacity: 1, refillPerSec: 1 } },
      now: clock.now,
      sleep: clock.sleep
    });
    expect(await broker.acquire("x")).toEqual({ granted: true }); // empties bucket
    // Next acquire must await ~1000ms for one token; the fake sleep advances time.
    const result = await broker.acquire("x", { timeoutMs: 5000 });
    expect(result).toEqual({ granted: true });
    expect(clock.now()).toBeGreaterThanOrEqual(1000);
  });

  it("times out when the wait exceeds the budget", async () => {
    const clock = fakeClock();
    const broker = new RateLimitBroker({
      budgets: { x: { capacity: 1, refillPerSec: 1 } },
      now: clock.now,
      sleep: clock.sleep
    });
    await broker.acquire("x");
    const result = await broker.acquire("x", { timeoutMs: 100 });
    expect(result).toEqual({ granted: false, reason: "timeout" });
  });

  it("times out immediately when a bucket never refills", async () => {
    const clock = fakeClock();
    const broker = new RateLimitBroker({
      budgets: { x: { capacity: 1, refillPerSec: 0 } },
      now: clock.now,
      sleep: clock.sleep
    });
    await broker.acquire("x");
    expect(await broker.acquire("x", { timeoutMs: 10_000 })).toEqual({
      granted: false,
      reason: "timeout"
    });
  });

  it("enforces a hard quota in addition to the time-window bucket", async () => {
    const clock = fakeClock();
    const broker = new RateLimitBroker({
      budgets: { yt: { capacity: 100, refillPerSec: 100, quota: 2 } },
      now: clock.now,
      sleep: clock.sleep
    });
    expect(await broker.acquire("yt")).toEqual({ granted: true });
    expect(await broker.acquire("yt")).toEqual({ granted: true });
    expect(broker.remainingQuota("yt")).toBe(0);
    expect(await broker.acquire("yt")).toEqual({ granted: false, reason: "quota" });

    broker.resetQuota("yt");
    expect(broker.remainingQuota("yt")).toBe(2);
    expect(await broker.acquire("yt")).toEqual({ granted: true });
  });

  it("emits rate-limit:warning once when crossing 80% utilisation", async () => {
    const clock = fakeClock();
    const events: Array<{ event: string; payload: RateLimitWarning }> = [];
    const broker = new RateLimitBroker({
      budgets: { x: { capacity: 10, refillPerSec: 0 } },
      now: clock.now,
      sleep: clock.sleep,
      emit: (event, payload) => events.push({ event, payload: payload as RateLimitWarning })
    });
    // Consume 7/10 (70%): no warning.
    await broker.acquire("x", { cost: 7 });
    expect(events).toHaveLength(0);
    // Consume 1 more → 80%: warning fires once.
    await broker.acquire("x");
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe("rate-limit:warning");
    expect(events[0]?.payload).toEqual({ platform: "x", budget: 10, used: 8 });
    // Consume 1 more → 90%: still armed, no second warning.
    await broker.acquire("x");
    expect(events).toHaveLength(1);
  });

  it("re-arms the warning after the bucket refills below threshold", async () => {
    const clock = fakeClock();
    const events: RateLimitWarning[] = [];
    const broker = new RateLimitBroker({
      budgets: { x: { capacity: 10, refillPerSec: 10 } },
      now: clock.now,
      sleep: clock.sleep,
      emit: (_e, payload) => events.push(payload as RateLimitWarning)
    });
    await broker.acquire("x", { cost: 8 }); // 80% → warn #1
    expect(events).toHaveLength(1);
    clock.advance(1000); // refill 10 tokens → full → utilisation 0
    await broker.acquire("x", { cost: 8 }); // crosses 80% again → warn #2
    expect(events).toHaveLength(2);
  });

  it("tryAcquire is non-blocking and respects quota + buckets", () => {
    const clock = fakeClock();
    const broker = new RateLimitBroker({
      budgets: { x: { capacity: 1, refillPerSec: 0, quota: 5 } },
      now: clock.now
    });
    expect(broker.tryAcquire("x")).toEqual({ granted: true });
    expect(broker.tryAcquire("x")).toEqual({ granted: false, reason: "timeout" });
    expect(broker.tryAcquire("missing")).toEqual({
      granted: false,
      reason: "unknown-platform"
    });
  });

  it("tryAcquire fails on exhausted quota", () => {
    const broker = new RateLimitBroker({
      budgets: { x: { capacity: 100, refillPerSec: 100, quota: 0 } }
    });
    expect(broker.tryAcquire("x")).toEqual({ granted: false, reason: "quota" });
  });
});
