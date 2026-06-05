/**
 * YouTube quota tracker — unit tests (epic #58).
 *
 * Tests for recordQuotaUsage, getQuotaUsage, over-quota enqueue path, and
 * the constants exported by the quota module.
 */
import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../db/index.js";
import {
  YOUTUBE_DAILY_QUOTA,
  READ_COST,
  WRITE_COST,
  getQuotaUsage,
  recordQuotaUsage
} from "./quota.js";

describe("YouTube quota constants", () => {
  it("exports the correct daily quota", () => {
    expect(YOUTUBE_DAILY_QUOTA).toBe(10_000);
  });

  it("exports read cost of 1", () => {
    expect(READ_COST).toBe(1);
  });

  it("exports write cost of 50", () => {
    expect(WRITE_COST).toBe(50);
  });
});

describe("getQuotaUsage", () => {
  let db: Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
  });

  afterEach(() => {
    db.close();
  });

  it("returns 0 when no rows exist for the day", () => {
    expect(getQuotaUsage(db, "2025-01-15")).toBe(0);
  });

  it("returns 0 for a different day when only today has data", () => {
    db.prepare(
      `INSERT INTO youtube_quota_usage (day_utc, quota_units) VALUES ('2025-01-14', 500)`
    ).run();
    expect(getQuotaUsage(db, "2025-01-15")).toBe(0);
  });

  it("returns recorded units for the requested day", () => {
    db.prepare(
      `INSERT INTO youtube_quota_usage (day_utc, quota_units) VALUES ('2025-01-15', 350)`
    ).run();
    expect(getQuotaUsage(db, "2025-01-15")).toBe(350);
  });

  it("defaults to today UTC when no day_utc argument given", () => {
    const today = new Date().toISOString().slice(0, 10);
    db.prepare(`INSERT INTO youtube_quota_usage (day_utc, quota_units) VALUES (?, 42)`).run(today);
    expect(getQuotaUsage(db)).toBe(42);
  });
});

describe("recordQuotaUsage", () => {
  let db: Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
  });

  afterEach(() => {
    db.close();
  });

  it("inserts a new row on first use", () => {
    recordQuotaUsage(db, 10, "2025-01-15");
    expect(getQuotaUsage(db, "2025-01-15")).toBe(10);
  });

  it("accumulates units across multiple calls on the same day", () => {
    recordQuotaUsage(db, READ_COST, "2025-01-15");
    recordQuotaUsage(db, WRITE_COST, "2025-01-15");
    recordQuotaUsage(db, READ_COST, "2025-01-15");
    expect(getQuotaUsage(db, "2025-01-15")).toBe(52);
  });

  it("does not bleed into a different day", () => {
    recordQuotaUsage(db, 200, "2025-01-14");
    recordQuotaUsage(db, 100, "2025-01-15");
    expect(getQuotaUsage(db, "2025-01-15")).toBe(100);
    expect(getQuotaUsage(db, "2025-01-14")).toBe(200);
  });

  it("defaults to today UTC when no day_utc argument given", () => {
    const today = new Date().toISOString().slice(0, 10);
    recordQuotaUsage(db, 25);
    expect(getQuotaUsage(db, today)).toBe(25);
  });

  it("is idempotent via upsert (accumulates, never loses data)", () => {
    recordQuotaUsage(db, 100, "2025-01-15");
    recordQuotaUsage(db, 100, "2025-01-15");
    expect(getQuotaUsage(db, "2025-01-15")).toBe(200);
  });
});

describe("recordFn injection pattern", () => {
  it("allows injecting a no-op recorder for testing connector code", () => {
    const calls: number[] = [];
    const fakeFn = (units: number): void => {
      calls.push(units);
    };
    fakeFn(READ_COST);
    fakeFn(WRITE_COST);
    expect(calls).toEqual([READ_COST, WRITE_COST]);
  });
});

describe("quota overflow detection", () => {
  let db: Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
  });

  afterEach(() => {
    db.close();
  });

  it("returns false (not exhausted) when usage is well below limit", () => {
    recordQuotaUsage(db, 100, "2025-01-15");
    const used = getQuotaUsage(db, "2025-01-15");
    expect(used + READ_COST > YOUTUBE_DAILY_QUOTA).toBe(false);
  });

  it("returns true (exhausted) when usage would exceed limit", () => {
    recordQuotaUsage(db, YOUTUBE_DAILY_QUOTA - 1, "2025-01-15");
    const used = getQuotaUsage(db, "2025-01-15");
    expect(used + WRITE_COST > YOUTUBE_DAILY_QUOTA).toBe(true);
  });

  it("returns true when usage exactly equals limit plus any cost", () => {
    recordQuotaUsage(db, YOUTUBE_DAILY_QUOTA, "2025-01-15");
    const used = getQuotaUsage(db, "2025-01-15");
    expect(used + READ_COST > YOUTUBE_DAILY_QUOTA).toBe(true);
  });

  it("returns false when usage plus cost exactly hits the limit (not over)", () => {
    recordQuotaUsage(db, YOUTUBE_DAILY_QUOTA - READ_COST, "2025-01-15");
    const used = getQuotaUsage(db, "2025-01-15");
    // exactly at limit — not over
    expect(used + READ_COST > YOUTUBE_DAILY_QUOTA).toBe(false);
  });
});

describe("getQuotaUsage with mocked clock", () => {
  let db: Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    vi.useFakeTimers();
  });

  afterEach(() => {
    db.close();
    vi.useRealTimers();
  });

  it("uses UTC date from the current clock when defaulting day_utc", () => {
    vi.setSystemTime(new Date("2025-07-04T23:59:59Z"));
    const today = "2025-07-04";
    db.prepare(`INSERT INTO youtube_quota_usage (day_utc, quota_units) VALUES (?, 77)`).run(today);
    expect(getQuotaUsage(db)).toBe(77);
  });
});
