/**
 * Tests for the auto-reply audit retention scheduler (#163) — node-cron driver
 * with an injectable cron factory so the suite never leaves a real timer
 * running, plus the pure bounds translation.
 */
import { describe, expect, it, vi } from "vitest";

import {
  AutoReplyRetentionScheduler,
  retentionBounds,
  type CronScheduleFn,
  type PrunableAuditRepository
} from "./retention-scheduler.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function fakeCron() {
  const handlers: Array<() => void> = [];
  const stop = vi.fn();
  const schedule: CronScheduleFn = (_expr, handler) => {
    handlers.push(handler);
    return { stop };
  };
  return { schedule, handlers, stop, fire: () => handlers.forEach((h) => h()) };
}

function auditStub(prune = vi.fn().mockReturnValue(0)): PrunableAuditRepository & {
  prune: ReturnType<typeof vi.fn>;
} {
  return { prune };
}

describe("retentionBounds", () => {
  it("derives an age cutoff from maxAgeDays relative to now", () => {
    const bounds = retentionBounds({ now: 100 * DAY_MS, maxAgeDays: 90, maxRows: 0 });
    expect(bounds.olderThan).toBe(100 * DAY_MS - 90 * DAY_MS);
    expect(bounds.maxRows).toBeUndefined();
  });

  it("includes the row cap and floors it", () => {
    const bounds = retentionBounds({ now: 0, maxAgeDays: 0, maxRows: 5000.9 });
    expect(bounds.olderThan).toBeUndefined();
    expect(bounds.maxRows).toBe(5000);
  });

  it("disables both halves on non-positive values", () => {
    expect(retentionBounds({ now: 1000, maxAgeDays: 0, maxRows: 0 })).toEqual({});
    expect(retentionBounds({ now: 1000, maxAgeDays: -1, maxRows: -1 })).toEqual({});
  });
});

describe("AutoReplyRetentionScheduler", () => {
  it("validates the cron expression up front", () => {
    expect(
      () =>
        new AutoReplyRetentionScheduler({
          audit: auditStub(),
          cronExpression: "not a cron",
          maxAgeDays: 90,
          maxRows: 0
        })
    ).toThrow(/invalid auto-reply retention cron/);
  });

  it("registers a task on start and stops it on stop (idempotent)", () => {
    const cron = fakeCron();
    const scheduler = new AutoReplyRetentionScheduler({
      audit: auditStub(),
      cronExpression: "20 3 * * *",
      maxAgeDays: 90,
      maxRows: 0,
      schedule: cron.schedule
    });
    scheduler.start();
    scheduler.start();
    expect(cron.handlers).toHaveLength(1);
    scheduler.stop();
    expect(cron.stop).toHaveBeenCalledOnce();
  });

  it("prunes with the derived bounds when the cron fires", async () => {
    const cron = fakeCron();
    const prune = vi.fn().mockReturnValue(3);
    const scheduler = new AutoReplyRetentionScheduler({
      audit: auditStub(prune),
      cronExpression: "20 3 * * *",
      maxAgeDays: 90,
      maxRows: 50_000,
      now: () => 100 * DAY_MS,
      schedule: cron.schedule
    });
    scheduler.start();
    cron.fire();
    await vi.waitFor(() => expect(prune).toHaveBeenCalled());
    expect(prune).toHaveBeenCalledWith({
      olderThan: 100 * DAY_MS - 90 * DAY_MS,
      maxRows: 50_000
    });
  });

  it("runs one prune per tick", async () => {
    const prune = vi.fn().mockReturnValue(0);
    const scheduler = new AutoReplyRetentionScheduler({
      audit: auditStub(prune),
      cronExpression: "20 3 * * *",
      maxAgeDays: 90,
      maxRows: 0
    });
    await scheduler.runTick();
    await scheduler.runTick();
    expect(prune).toHaveBeenCalledTimes(2);
  });

  it("swallows prune errors so the scheduler keeps running", async () => {
    const error = vi.fn();
    const prune = vi.fn().mockImplementation(() => {
      throw new Error("kaboom");
    });
    const scheduler = new AutoReplyRetentionScheduler({
      audit: auditStub(prune),
      cronExpression: "20 3 * * *",
      maxAgeDays: 90,
      maxRows: 0,
      logger: { error }
    });
    await expect(scheduler.runTick()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
