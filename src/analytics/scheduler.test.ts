import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../db/index.js";
import { AnalyticsCacheRepository } from "./repository.js";
import {
  AnalyticsAggregatorScheduler,
  WeeklyDigestScheduler,
  runAggregation,
  runDigest,
  type CronScheduleFn,
  type CronTask
} from "./scheduler.js";

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const DAY_MS = 86_400_000;

describe("analytics scheduler", () => {
  let db: Database;
  let repo: AnalyticsCacheRepository;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    repo = new AnalyticsCacheRepository(db);
    db.prepare(
      `INSERT INTO platform_insights_raw
         (platform, object_type, object_id, metric, value, captured_for)
       VALUES ('instagram', 'media', 'p1', 'likes', 12, ?)`
    ).run(new Date(NOW - DAY_MS).toISOString().slice(0, 10));
    db.prepare(
      `INSERT INTO outbox (platform, body, status, external_id, published_at, created_at, updated_at)
       VALUES ('instagram', '', 'published', 'p1', ?, ?, ?)`
    ).run(NOW - DAY_MS, NOW - DAY_MS, NOW - DAY_MS);
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  describe("runAggregation", () => {
    it("persists a snapshot the cache can read back", () => {
      const result = runAggregation({ repo, timezone: "UTC", now: NOW });
      expect(result.capturedFor).toBe("2026-06-15");
      expect(result.platforms).toBe(1);
      expect(repo.getSummary(7)).not.toHaveLength(0);
      expect(repo.getTopPosts(7)[0]?.externalId).toBe("p1");
    });
  });

  describe("AnalyticsAggregatorScheduler", () => {
    it("rejects an invalid cron expression", () => {
      expect(
        () => new AnalyticsAggregatorScheduler({ repo, timezone: "UTC", cronExpression: "nope" })
      ).toThrow(/invalid analytics aggregator cron/);
    });

    it("schedules, runs a tick, emits analytics:updated, and stops idempotently", async () => {
      let handler: (() => void) | undefined;
      const task: CronTask = { stop: vi.fn() };
      const schedule: CronScheduleFn = (_expr, h) => {
        handler = h;
        return task;
      };
      const emit = vi.fn();
      const scheduler = new AnalyticsAggregatorScheduler({
        repo,
        timezone: "UTC",
        cronExpression: "10 3 * * *",
        now: () => NOW,
        schedule,
        emit
      });

      scheduler.start();
      scheduler.start(); // idempotent
      expect(handler).toBeDefined();

      await scheduler.runTick();
      expect(emit).toHaveBeenCalledWith("analytics:updated", { capturedFor: "2026-06-15" });

      scheduler.stop();
      scheduler.stop(); // idempotent
      expect(task.stop).toHaveBeenCalledTimes(1);
    });

    it("logs and swallows aggregation errors", async () => {
      const broken = {
        readInsightRows: () => {
          throw new Error("boom");
        }
      } as unknown as AnalyticsCacheRepository;
      const error = vi.fn();
      const scheduler = new AnalyticsAggregatorScheduler({
        repo: broken,
        timezone: "UTC",
        cronExpression: "10 3 * * *",
        now: () => NOW,
        logger: { error }
      });
      await expect(scheduler.runTick()).resolves.toBeUndefined();
      expect(error).toHaveBeenCalled();
    });
  });

  describe("runDigest", () => {
    it("delivers over both telegram and mailer, best-effort", async () => {
      const notify = vi.fn().mockResolvedValue(undefined);
      const send = vi.fn().mockResolvedValue(undefined);
      const markdown = await runDigest({
        repo,
        timezone: "UTC",
        topLimit: 3,
        now: NOW,
        notify,
        mailer: { send }
      });
      expect(markdown).toContain("Weekly Analytics Digest");
      expect(notify).toHaveBeenCalledOnce();
      expect(send).toHaveBeenCalledWith("Weekly Analytics Digest", expect.any(String));
    });

    it("isolates a telegram failure from email delivery", async () => {
      const notify = vi.fn().mockRejectedValue(new Error("tg down"));
      const send = vi.fn().mockResolvedValue(undefined);
      const error = vi.fn();
      await runDigest({
        repo,
        timezone: "UTC",
        topLimit: 3,
        now: NOW,
        notify,
        mailer: { send },
        logger: { error }
      });
      expect(send).toHaveBeenCalledOnce();
      expect(error).toHaveBeenCalled();
    });

    it("skips delivery channels that are not configured", async () => {
      const markdown = await runDigest({ repo, timezone: "UTC", topLimit: 3, now: NOW });
      expect(markdown).toContain("Weekly Analytics Digest");
    });
  });

  describe("WeeklyDigestScheduler", () => {
    it("rejects an invalid cron expression", () => {
      expect(
        () =>
          new WeeklyDigestScheduler({
            repo,
            timezone: "UTC",
            topLimit: 3,
            cronExpression: "nope"
          })
      ).toThrow(/invalid weekly digest cron/);
    });

    it("schedules, runs a tick, and stops idempotently", async () => {
      const task: CronTask = { stop: vi.fn() };
      const schedule: CronScheduleFn = () => task;
      const notify = vi.fn().mockResolvedValue(undefined);
      const scheduler = new WeeklyDigestScheduler({
        repo,
        timezone: "UTC",
        topLimit: 3,
        cronExpression: "0 18 * * 0",
        now: () => NOW,
        notify,
        schedule
      });
      scheduler.start();
      scheduler.start();
      await scheduler.runTick();
      expect(notify).toHaveBeenCalled();
      scheduler.stop();
      expect(task.stop).toHaveBeenCalledTimes(1);
    });
  });
});
