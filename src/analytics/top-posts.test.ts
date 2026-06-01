import { describe, expect, it } from "vitest";

import { topPosts, weekOverWeekDeltas } from "./top-posts.js";
import type { InsightRow, PublishedPost } from "./types.js";

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const DAY_MS = 86_400_000;

function insight(
  objectId: string,
  value: number,
  platform = "instagram",
  offsetDays = 1
): InsightRow {
  return {
    platform,
    objectType: "media",
    objectId,
    metric: "likes",
    value,
    capturedFor: new Date(NOW - offsetDays * DAY_MS).toISOString().slice(0, 10)
  };
}

describe("topPosts", () => {
  it("ranks posts by engagement per platform, honoring the limit", () => {
    const insights: InsightRow[] = [
      insight("a", 10),
      insight("b", 30),
      insight("c", 20),
      insight("x", 99, "linkedin")
    ];
    const ranked = topPosts({ insights, posts: [], now: NOW, windowDays: 7, limit: 2 });
    expect(ranked.filter((p) => p.platform === "instagram").map((p) => p.externalId)).toEqual([
      "b",
      "c"
    ]);
    expect(ranked.find((p) => p.platform === "instagram" && p.externalId === "b")?.rank).toBe(1);
    expect(ranked.find((p) => p.platform === "linkedin")?.externalId).toBe("x");
  });

  it("joins publishedAt from the outbox and defaults to null", () => {
    const posts: PublishedPost[] = [
      { platform: "instagram", externalId: "a", publishedAt: NOW - DAY_MS }
    ];
    const ranked = topPosts({
      insights: [insight("a", 5), insight("b", 3)],
      posts,
      now: NOW,
      windowDays: 7
    });
    expect(ranked.find((p) => p.externalId === "a")?.publishedAt).toBe(NOW - DAY_MS);
    expect(ranked.find((p) => p.externalId === "b")?.publishedAt).toBeNull();
  });

  it("restricts to a single platform when given", () => {
    const insights: InsightRow[] = [insight("a", 5), insight("x", 8, "linkedin")];
    const ranked = topPosts({ insights, posts: [], now: NOW, windowDays: 7, platform: "linkedin" });
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.platform).toBe("linkedin");
  });

  it("clamps an out-of-range limit", () => {
    const ranked = topPosts({
      insights: [insight("a", 1)],
      posts: [],
      now: NOW,
      windowDays: 7,
      limit: -5
    });
    expect(ranked).toHaveLength(1);
  });
});

describe("weekOverWeekDeltas", () => {
  it("computes this-week vs last-week engagement and pctChange", () => {
    const insights: InsightRow[] = [
      insight("a", 100, "instagram", 1), // this week
      insight("a", 50, "instagram", 10) // last week (8 days ago)
    ];
    const [delta] = weekOverWeekDeltas({ insights, now: NOW });
    expect(delta).toMatchObject({
      platform: "instagram",
      thisWeek: 100,
      lastWeek: 50,
      delta: 50,
      pctChange: 100
    });
  });

  it("returns null pctChange when last week was zero", () => {
    const insights: InsightRow[] = [insight("a", 40, "instagram", 1)];
    const [delta] = weekOverWeekDeltas({ insights, now: NOW });
    expect(delta!.lastWeek).toBe(0);
    expect(delta!.pctChange).toBeNull();
  });
});
