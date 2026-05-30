/**
 * Tests for the outbox scheduler (#86) — node-cron driver with an injectable
 * cron factory so the suite never leaves a real timer running.
 */
import { describe, expect, it, vi } from "vitest";
import { OutboxPoller } from "./poller.js";
import { DEFAULT_OUTBOX_CRON, OutboxScheduler, type CronScheduleFn } from "./scheduler.js";

function fakeCron() {
  const handlers: Array<() => void> = [];
  const stop = vi.fn();
  const schedule: CronScheduleFn = (_expr, handler) => {
    handlers.push(handler);
    return { stop };
  };
  return { schedule, handlers, stop, fire: () => handlers.forEach((h) => h()) };
}

function pollerStub(tick: () => Promise<{ claimed: number; published: number; failed: number }>) {
  return { tick } as unknown as OutboxPoller;
}

describe("OutboxScheduler", () => {
  it("validates the cron expression up front", () => {
    expect(
      () =>
        new OutboxScheduler({
          poller: pollerStub(async () => ({ claimed: 0, published: 0, failed: 0 })),
          cronExpression: "not a cron"
        })
    ).toThrow(/invalid outbox cron/);
  });

  it("registers a task on start and stops it on stop", () => {
    const cron = fakeCron();
    const scheduler = new OutboxScheduler({
      poller: pollerStub(async () => ({ claimed: 0, published: 0, failed: 0 })),
      schedule: cron.schedule
    });
    scheduler.start();
    expect(cron.handlers).toHaveLength(1);
    scheduler.stop();
    expect(cron.stop).toHaveBeenCalledOnce();
  });

  it("is idempotent on start", () => {
    const cron = fakeCron();
    const scheduler = new OutboxScheduler({
      poller: pollerStub(async () => ({ claimed: 0, published: 0, failed: 0 })),
      schedule: cron.schedule
    });
    scheduler.start();
    scheduler.start();
    expect(cron.handlers).toHaveLength(1);
  });

  it("runs the poller tick when the cron fires", async () => {
    const cron = fakeCron();
    const tick = vi.fn().mockResolvedValue({ claimed: 1, published: 1, failed: 0 });
    const scheduler = new OutboxScheduler({ poller: pollerStub(tick), schedule: cron.schedule });
    scheduler.start();
    cron.fire();
    await vi.waitFor(() => expect(tick).toHaveBeenCalled());
  });

  it("skips overlapping ticks", async () => {
    let resolve!: () => void;
    const gate = new Promise<void>((r) => {
      resolve = r;
    });
    const tick = vi.fn().mockImplementation(async () => {
      await gate;
      return { claimed: 0, published: 0, failed: 0 };
    });
    const scheduler = new OutboxScheduler({ poller: pollerStub(tick) });

    const first = scheduler.runTick();
    const second = scheduler.runTick();
    resolve();
    await Promise.all([first, second]);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("swallows tick errors so the scheduler keeps running", async () => {
    const tick = vi.fn().mockRejectedValue(new Error("kaboom"));
    const error = vi.fn();
    const scheduler = new OutboxScheduler({
      poller: pollerStub(tick),
      logger: { error }
    });
    await expect(scheduler.runTick()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });

  it("defaults to a sub-60s cadence", () => {
    expect(DEFAULT_OUTBOX_CRON).toBe("*/30 * * * * *");
  });
});
