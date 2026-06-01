import { describe, expect, it } from "vitest";

import { bucketPublishTimes, localDayOfWeek, localHourOfDay, toHeatmapMatrix } from "./heatmap.js";
import type { PublishedPost } from "./types.js";

// 2026-06-15 is a Monday.
const MON_1200_UTC = Date.UTC(2026, 5, 15, 12, 0, 0);

describe("localDayOfWeek / localHourOfDay", () => {
  it("reads the local calendar date and hour in the given timezone", () => {
    expect(localDayOfWeek(MON_1200_UTC, "UTC")).toBe(1); // Monday
    expect(localHourOfDay(MON_1200_UTC, "UTC")).toBe(12);
  });

  it("shifts day and hour across a timezone boundary at 23:30", () => {
    // 2026-06-15T23:30Z is still Monday in UTC...
    const lateMon = Date.UTC(2026, 5, 15, 23, 30, 0);
    expect(localDayOfWeek(lateMon, "UTC")).toBe(1);
    // ...but already Tuesday 01:30 in Berlin (+2 in June).
    expect(localDayOfWeek(lateMon, "Europe/Berlin")).toBe(2);
    expect(localHourOfDay(lateMon, "Europe/Berlin")).toBe(1);
  });

  it("never leaks a 23:30 post into the wrong local day (negative offset)", () => {
    // 2026-06-15T01:30Z is Monday UTC but Sunday 21:30 in New York (-4).
    const earlyMon = Date.UTC(2026, 5, 15, 1, 30, 0);
    expect(localDayOfWeek(earlyMon, "America/New_York")).toBe(0); // Sunday
    expect(localHourOfDay(earlyMon, "America/New_York")).toBe(21);
  });
});

describe("bucketPublishTimes", () => {
  function post(platform: string, at: number): PublishedPost {
    return { platform, externalId: `${platform}-${at}`, publishedAt: at };
  }

  it("counts posts per (platform, day, hour) bucket", () => {
    const posts: PublishedPost[] = [
      post("instagram", MON_1200_UTC),
      post("instagram", MON_1200_UTC + 1000), // same hour
      post("linkedin", MON_1200_UTC)
    ];
    const buckets = bucketPublishTimes({ posts, timezone: "UTC" });
    expect(buckets).toEqual([
      { platform: "instagram", dayOfWeek: 1, hourOfDay: 12, count: 2 },
      { platform: "linkedin", dayOfWeek: 1, hourOfDay: 12, count: 1 }
    ]);
  });

  it("filters to a single platform when requested", () => {
    const posts: PublishedPost[] = [
      post("instagram", MON_1200_UTC),
      post("linkedin", MON_1200_UTC)
    ];
    const buckets = bucketPublishTimes({ posts, timezone: "UTC", platform: "linkedin" });
    expect(buckets).toEqual([{ platform: "linkedin", dayOfWeek: 1, hourOfDay: 12, count: 1 }]);
  });

  it("skips posts with a non-finite publishedAt", () => {
    const posts: PublishedPost[] = [post("instagram", Number.NaN)];
    expect(bucketPublishTimes({ posts, timezone: "UTC" })).toEqual([]);
  });

  it("throws on an invalid timezone", () => {
    expect(() => bucketPublishTimes({ posts: [], timezone: "Mars/Olympus" })).toThrow(
      /invalid analytics timezone/
    );
  });
});

describe("toHeatmapMatrix", () => {
  it("expands sparse buckets into a dense 7×24 matrix summing across platforms", () => {
    const matrix = toHeatmapMatrix([
      { platform: "instagram", dayOfWeek: 1, hourOfDay: 12, count: 2 },
      { platform: "linkedin", dayOfWeek: 1, hourOfDay: 12, count: 3 }
    ]);
    expect(matrix).toHaveLength(7);
    expect(matrix[0]).toHaveLength(24);
    expect(matrix[1]![12]).toBe(5);
  });

  it("ignores out-of-range buckets", () => {
    const matrix = toHeatmapMatrix([
      { platform: "x", dayOfWeek: 9, hourOfDay: 0, count: 1 },
      { platform: "x", dayOfWeek: 0, hourOfDay: 99, count: 1 }
    ]);
    expect(matrix.flat().every((v) => v === 0)).toBe(true);
  });
});
