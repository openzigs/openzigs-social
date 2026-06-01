import { describe, expect, it } from "vitest";

import { aggregatePostMetrics, parseDayKeyMs, rollupEngagement, utcDayKey } from "./aggregator.js";
import type { InsightRow, PublishedPost } from "./types.js";

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0); // 2026-06-15T12:00Z
const DAY_MS = 86_400_000;

function dayKey(offsetDays: number): string {
  return utcDayKey(NOW - offsetDays * DAY_MS);
}

function insight(partial: Partial<InsightRow> & Pick<InsightRow, "metric" | "value">): InsightRow {
  return {
    platform: "instagram",
    objectType: "media",
    objectId: "post-1",
    capturedFor: dayKey(1),
    ...partial
  };
}

describe("utcDayKey / parseDayKeyMs", () => {
  it("derives a UTC YYYY-MM-DD key", () => {
    expect(utcDayKey(NOW)).toBe("2026-06-15");
  });

  it("round-trips a calendar key to UTC midnight", () => {
    expect(parseDayKeyMs("2026-06-15")).toBe(Date.UTC(2026, 5, 15));
  });

  it("returns null for non-date keys", () => {
    expect(parseDayKeyMs("d1")).toBeNull();
    expect(parseDayKeyMs("2026-13-40")).not.toBeNaN();
    expect(parseDayKeyMs("garbage")).toBeNull();
  });
});

describe("aggregatePostMetrics", () => {
  it("takes the MAX cumulative reading per (object, metric) in the window", () => {
    const insights: InsightRow[] = [
      insight({ metric: "likes", value: 5, capturedFor: dayKey(3) }),
      insight({ metric: "likes", value: 9, capturedFor: dayKey(1) }),
      insight({ metric: "comments", value: 2, capturedFor: dayKey(1) })
    ];
    const totals = aggregatePostMetrics(insights, NOW, 7);
    expect(totals).toEqual([
      { platform: "instagram", objectId: "post-1", engagement: 11, impressions: 0 }
    ]);
  });

  it("separates engagement from impression metrics", () => {
    const insights: InsightRow[] = [
      insight({ metric: "likes", value: 4 }),
      insight({ metric: "impressions", value: 100 }),
      insight({ metric: "reach", value: 80 })
    ];
    const [t] = aggregatePostMetrics(insights, NOW, 7);
    expect(t).toMatchObject({ engagement: 4, impressions: 180 });
  });

  it("ignores account-level objects and out-of-window readings", () => {
    const insights: InsightRow[] = [
      insight({ objectType: "account", metric: "likes", value: 999 }),
      insight({ metric: "likes", value: 7, capturedFor: dayKey(40) })
    ];
    expect(aggregatePostMetrics(insights, NOW, 7)).toEqual([]);
  });

  it("ignores unknown metrics", () => {
    const insights: InsightRow[] = [insight({ metric: "mystery_metric", value: 50 })];
    expect(aggregatePostMetrics(insights, NOW, 7)).toEqual([]);
  });
});

describe("rollupEngagement", () => {
  it("emits all four metrics for every connected platform and window", () => {
    const insights: InsightRow[] = [
      insight({ platform: "instagram", metric: "likes", value: 10 }),
      insight({ platform: "instagram", objectType: "account", metric: "followers", value: 500 })
    ];
    const posts: PublishedPost[] = [
      { platform: "linkedin", externalId: "li-1", publishedAt: NOW - DAY_MS }
    ];
    const rows = rollupEngagement({ insights, posts, now: NOW });

    // 2 platforms × 3 windows × 4 metrics = 24 rows.
    expect(rows).toHaveLength(24);
    expect(new Set(rows.map((r) => r.platform))).toEqual(new Set(["instagram", "linkedin"]));
    for (const r of rows) expect(r.capturedFor).toBe("2026-06-15");
  });

  it("degrades a platform with no engagement to all-zero rows", () => {
    const posts: PublishedPost[] = [
      { platform: "facebook", externalId: "fb-1", publishedAt: NOW - DAY_MS }
    ];
    const rows = rollupEngagement({ insights: [], posts, now: NOW });
    expect(rows.every((r) => r.platform === "facebook")).toBe(true);
    expect(rows.every((r) => r.value === 0)).toBe(true);
  });

  it("returns nothing when there are no platforms at all", () => {
    expect(rollupEngagement({ insights: [], posts: [], now: NOW })).toEqual([]);
  });

  it("counts posts and follower totals correctly", () => {
    const insights: InsightRow[] = [
      insight({ objectId: "p1", metric: "likes", value: 3 }),
      insight({ objectId: "p2", metric: "likes", value: 4 }),
      insight({ objectType: "account", objectId: "acct", metric: "followers", value: 1200 })
    ];
    const rows = rollupEngagement({ insights, posts: [], now: NOW, windows: [7] });
    const byMetric = Object.fromEntries(rows.map((r) => [r.metric, r.value]));
    expect(byMetric.posts).toBe(2);
    expect(byMetric.engagement).toBe(7);
    expect(byMetric.followers).toBe(1200);
  });

  it("is idempotent for the same inputs", () => {
    const insights: InsightRow[] = [insight({ metric: "likes", value: 8 })];
    const a = rollupEngagement({ insights, posts: [], now: NOW });
    const b = rollupEngagement({ insights, posts: [], now: NOW });
    expect(a).toEqual(b);
  });
});
