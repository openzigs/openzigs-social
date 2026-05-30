import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../db/index.js";
import { TwitterCreditTracker } from "./credit-tracker.js";
import { TwitterQuotaExceededError, TwitterQuotaGuard, type QuotaEvent } from "./quota-guard.js";

const MONTH = "2026-05";
const clock = () => new Date("2026-05-15T12:00:00.000Z");

describe("TwitterQuotaGuard", () => {
  let db: Database;
  let tracker: TwitterCreditTracker;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    tracker = new TwitterCreditTracker({ db, now: clock });
  });

  afterEach(() => {
    db.close();
  });

  it("reports the current usage summary", () => {
    tracker.record({ kind: "tweet", dedupeKey: "a", amount: 5 });
    const guard = new TwitterQuotaGuard({ tracker, cap: 10 });
    expect(guard.status()).toMatchObject({ used: 5, cap: 10, remaining: 5 });
  });

  it("emits a warning event + alert once when crossing the threshold", () => {
    const events: QuotaEvent[] = [];
    const alerts: string[] = [];
    const guard = new TwitterQuotaGuard({
      tracker,
      cap: 10,
      warnThreshold: 0.8,
      emit: (_e, payload) => events.push(payload),
      alert: (text) => void alerts.push(text)
    });

    tracker.record({ kind: "tweet", dedupeKey: "seed", amount: 7 });
    guard.recordWrite({ kind: "tweet", dedupeKey: "t8" }); // -> 8/10 = 80%

    expect(events).toHaveLength(1);
    expect(events[0]!.level).toBe("warning");
    expect(alerts[0]).toContain("⚠️");

    guard.recordWrite({ kind: "tweet", dedupeKey: "t9" }); // -> 9/10, still warning band
    expect(events.filter((e) => e.level === "warning")).toHaveLength(1); // edge-triggered once
  });

  it("emits an exceeded event when usage reaches the cap", () => {
    const events: QuotaEvent[] = [];
    const guard = new TwitterQuotaGuard({
      tracker,
      cap: 2,
      emit: (_e, payload) => events.push(payload)
    });
    tracker.record({ kind: "tweet", dedupeKey: "seed", amount: 1 });
    guard.recordWrite({ kind: "tweet", dedupeKey: "t2" }); // -> 2/2

    expect(events.some((e) => e.level === "exceeded")).toBe(true);
  });

  it("throws TwitterQuotaExceededError once the cap is reached", () => {
    tracker.record({ kind: "tweet", dedupeKey: "a", amount: 10 });
    const guard = new TwitterQuotaGuard({ tracker, cap: 10 });
    expect(() => guard.ensureWithinQuota()).toThrow(TwitterQuotaExceededError);
  });

  it("does not throw while under the cap", () => {
    tracker.record({ kind: "tweet", dedupeKey: "a", amount: 9 });
    const guard = new TwitterQuotaGuard({ tracker, cap: 10 });
    expect(() => guard.ensureWithinQuota()).not.toThrow();
  });

  it("fires the exceeded alert only once per month from ensureWithinQuota", () => {
    tracker.record({ kind: "tweet", dedupeKey: "a", amount: 10 });
    const emit = vi.fn();
    const guard = new TwitterQuotaGuard({ tracker, cap: 10, emit });
    expect(() => guard.ensureWithinQuota()).toThrow();
    expect(() => guard.ensureWithinQuota()).toThrow();
    const exceeded = emit.mock.calls.filter(
      ([, payload]) => (payload as QuotaEvent).level === "exceeded"
    );
    expect(exceeded).toHaveLength(1);
    expect(emit.mock.calls[0]![1]).toMatchObject({ summary: { month: MONTH } });
  });
});
