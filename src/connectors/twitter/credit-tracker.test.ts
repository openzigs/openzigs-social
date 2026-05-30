import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../../db/index.js";
import { TwitterCreditTracker, utcMonth } from "./credit-tracker.js";

const MONTH = "2026-05";
const clock = () => new Date("2026-05-15T12:00:00.000Z");

describe("utcMonth", () => {
  it("buckets a date into a UTC YYYY-MM string", () => {
    expect(utcMonth(new Date("2026-05-15T23:59:59Z"))).toBe("2026-05");
    expect(utcMonth(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
  });
});

describe("TwitterCreditTracker", () => {
  let db: Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
  });

  afterEach(() => {
    db.close();
  });

  it("records a billable write and counts it for the month", () => {
    const tracker = new TwitterCreditTracker({ db, now: clock });
    expect(tracker.record({ kind: "tweet", dedupeKey: "tweet:1" })).toBe(true);
    expect(tracker.usedThisMonth(MONTH)).toBe(1);
  });

  it("is idempotent on the dedupe key (a retry never double-counts)", () => {
    const tracker = new TwitterCreditTracker({ db, now: clock });
    expect(tracker.record({ kind: "tweet", dedupeKey: "tweet:1" })).toBe(true);
    expect(tracker.record({ kind: "tweet", dedupeKey: "tweet:1" })).toBe(false);
    expect(tracker.usedThisMonth(MONTH)).toBe(1);
  });

  it("sums custom amounts and isolates by month", () => {
    const tracker = new TwitterCreditTracker({ db, now: clock });
    tracker.record({ kind: "tweet", dedupeKey: "a", amount: 3 });
    tracker.record({ kind: "dm", dedupeKey: "b", amount: 2, month: "2026-06" });
    expect(tracker.usedThisMonth(MONTH)).toBe(3);
    expect(tracker.usedThisMonth("2026-06")).toBe(2);
  });

  it("persists usage across a reopened database", () => {
    const tmp = `${process.env.TMPDIR ?? "/tmp"}/twitter-credit-${Date.now()}.db`;
    const first = openDb({ path: tmp });
    new TwitterCreditTracker({ db: first, now: clock }).record({ kind: "tweet", dedupeKey: "x" });
    first.close();

    const second = openDb({ path: tmp });
    const tracker = new TwitterCreditTracker({ db: second, now: clock });
    expect(tracker.usedThisMonth(MONTH)).toBe(1);
    second.close();
  });

  it("summarises usage against a cap with clamped ratio", () => {
    const tracker = new TwitterCreditTracker({ db, now: clock });
    tracker.record({ kind: "tweet", dedupeKey: "a", amount: 80 });
    const summary = tracker.summary(100);
    expect(summary).toEqual({ month: MONTH, used: 80, cap: 100, remaining: 20, ratio: 0.8 });
  });

  it("reports zero remaining and ratio 1 when over cap", () => {
    const tracker = new TwitterCreditTracker({ db, now: clock });
    tracker.record({ kind: "tweet", dedupeKey: "a", amount: 150 });
    const summary = tracker.summary(100);
    expect(summary.remaining).toBe(0);
    expect(summary.ratio).toBe(1);
  });
});
