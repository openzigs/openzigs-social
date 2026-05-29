import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MetaScheduler, type SchedulerTask } from "./scheduler.js";

describe("MetaScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a task on its interval", async () => {
    const run = vi.fn(async () => undefined);
    const task: SchedulerTask = { name: "inbox", intervalMs: 1000, run };
    const scheduler = new MetaScheduler({ tasks: [task] });
    scheduler.start();

    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it("runs multiple tasks at independent cadences", async () => {
    const fast = vi.fn(async () => undefined);
    const slow = vi.fn(async () => undefined);
    const scheduler = new MetaScheduler({
      tasks: [
        { name: "fast", intervalMs: 500, run: fast },
        { name: "slow", intervalMs: 2000, run: slow }
      ]
    });
    scheduler.start();

    await vi.advanceTimersByTimeAsync(2000);
    expect(fast).toHaveBeenCalledTimes(4);
    expect(slow).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });

  it("keeps polling after a task throws and reports the error", async () => {
    const onError = vi.fn();
    const run = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    const scheduler = new MetaScheduler({
      tasks: [{ name: "insights", intervalMs: 1000, run }],
      onError
    });
    scheduler.start();

    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledWith("insights", expect.any(Error));
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it("stop cancels pending timers", async () => {
    const run = vi.fn(async () => undefined);
    const scheduler = new MetaScheduler({ tasks: [{ name: "x", intervalMs: 1000, run }] });
    scheduler.start();
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).not.toHaveBeenCalled();
  });

  it("start is idempotent", async () => {
    const run = vi.fn(async () => undefined);
    const scheduler = new MetaScheduler({ tasks: [{ name: "x", intervalMs: 1000, run }] });
    scheduler.start();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it("skips overlapping runs when a task is still in flight", async () => {
    let resolve!: () => void;
    const run = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        })
    );
    const scheduler = new MetaScheduler({ tasks: [{ name: "slow", intervalMs: 1000, run }] });
    scheduler.start();

    await vi.advanceTimersByTimeAsync(1000); // starts run #1 (pending)
    await vi.advanceTimersByTimeAsync(1000); // tick fires, sees in-flight, reschedules
    expect(run).toHaveBeenCalledTimes(1);

    resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });
});
