import { describe, expect, it } from "vitest";

import { buildDigestMarkdown, composeWeeklyDigest } from "./digest.js";
import type { InsightRow } from "./types.js";

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0); // Mon 2026-06-15
const DAY_MS = 86_400_000;

function insight(objectId: string, value: number, platform: string, offsetDays = 1): InsightRow {
  return {
    platform,
    objectType: "media",
    objectId,
    metric: "likes",
    value,
    capturedFor: new Date(NOW - offsetDays * DAY_MS).toISOString().slice(0, 10)
  };
}

describe("composeWeeklyDigest", () => {
  it("renders the exact Markdown for a populated week", () => {
    const insights: InsightRow[] = [insight("a", 100, "instagram"), insight("x", 50, "linkedin")];
    const { markdown } = composeWeeklyDigest({ insights, posts: [], now: NOW, timezone: "UTC" });
    expect(markdown).toBe(
      [
        "📊 *Weekly Analytics Digest*",
        "_Jun 8 – Jun 15_",
        "",
        "*Engagement vs last week*",
        "• instagram: 100 (new)",
        "• linkedin: 50 (new)",
        "",
        "*Top posts this week*",
        "1. instagram — a (100 engagement)",
        "2. linkedin — x (50 engagement)"
      ].join("\n")
    );
  });

  it("ranks top posts globally across platforms, honoring topLimit", () => {
    const insights: InsightRow[] = [
      insight("a", 10, "instagram"),
      insight("x", 30, "linkedin"),
      insight("b", 20, "instagram")
    ];
    const { data } = composeWeeklyDigest({
      insights,
      posts: [],
      now: NOW,
      timezone: "UTC",
      topLimit: 2
    });
    expect(data.topPosts.map((p) => p.externalId)).toEqual(["x", "b"]);
    expect(data.topPosts[0]!.rank).toBe(1);
  });

  it("renders empty-state copy when there is no activity", () => {
    const { markdown } = composeWeeklyDigest({
      insights: [],
      posts: [],
      now: NOW,
      timezone: "UTC"
    });
    expect(markdown).toContain("No engagement recorded this week.");
    expect(markdown).toContain("No posts to highlight yet.");
  });
});

describe("buildDigestMarkdown", () => {
  it("formats a downward week-over-week movement with a percentage", () => {
    const markdown = buildDigestMarkdown({
      generatedAt: NOW,
      timezone: "UTC",
      topPosts: [],
      deltas: [{ platform: "instagram", thisWeek: 50, lastWeek: 100, delta: -50, pctChange: -50 }]
    });
    expect(markdown).toContain("• instagram: 50 (▼ 50%)");
  });
});
