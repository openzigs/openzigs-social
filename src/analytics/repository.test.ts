import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../db/index.js";
import { AnalyticsCacheRepository } from "./repository.js";
import type { HeatmapBucket, RollupRow, TopPost } from "./types.js";

describe("AnalyticsCacheRepository", () => {
  let db: Database;
  let repo: AnalyticsCacheRepository;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    repo = new AnalyticsCacheRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function seedInsight(opts: {
    platform: string;
    objectType: string;
    objectId: string;
    metric: string;
    value: number;
    capturedFor: string;
  }) {
    db.prepare(
      `INSERT INTO platform_insights_raw
         (platform, object_type, object_id, metric, value, captured_for)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(opts.platform, opts.objectType, opts.objectId, opts.metric, opts.value, opts.capturedFor);
  }

  function seedPublished(platform: string, externalId: string, publishedAt: number) {
    db.prepare(
      `INSERT INTO outbox (platform, body, status, external_id, published_at, created_at, updated_at)
       VALUES (?, '', 'published', ?, ?, ?, ?)`
    ).run(platform, externalId, publishedAt, publishedAt, publishedAt);
  }

  it("reads raw insights and published posts", () => {
    seedInsight({
      platform: "instagram",
      objectType: "media",
      objectId: "p1",
      metric: "likes",
      value: 5,
      capturedFor: "2026-06-15"
    });
    seedPublished("instagram", "p1", 1_700_000_000_000);

    expect(repo.readInsightRows()).toEqual([
      {
        platform: "instagram",
        objectType: "media",
        objectId: "p1",
        metric: "likes",
        value: 5,
        capturedFor: "2026-06-15"
      }
    ]);
    expect(repo.readPublishedPosts()).toEqual([
      { platform: "instagram", externalId: "p1", publishedAt: 1_700_000_000_000 }
    ]);
  });

  function snapshotFor(capturedFor: string) {
    const rollups: RollupRow[] = [
      { platform: "instagram", windowDays: 7, metric: "engagement", value: 42, capturedFor },
      { platform: "instagram", windowDays: 7, metric: "posts", value: 3, capturedFor },
      { platform: "instagram", windowDays: 7, metric: "impressions", value: 100, capturedFor },
      { platform: "instagram", windowDays: 7, metric: "followers", value: 500, capturedFor }
    ];
    const heatmap: HeatmapBucket[] = [
      { platform: "instagram", dayOfWeek: 1, hourOfDay: 12, count: 2 }
    ];
    const topPostsByWindow = new Map<number, TopPost[]>([
      [7, [{ platform: "instagram", externalId: "p1", engagement: 42, publishedAt: 1, rank: 1 }]]
    ]);
    return { capturedFor, rollups, heatmap, topPostsByWindow };
  }

  it("writes a snapshot and reads it back through the cache getters", () => {
    repo.writeSnapshot(snapshotFor("2026-06-15"));

    expect(repo.latestCapturedFor()).toBe("2026-06-15");
    const summary = repo.getSummary(7);
    expect(summary).toHaveLength(4);
    expect(repo.getHeatmap()).toEqual([
      { platform: "instagram", dayOfWeek: 1, hourOfDay: 12, count: 2 }
    ]);
    expect(repo.getTopPosts(7)[0]).toMatchObject({ externalId: "p1", rank: 1 });
  });

  it("filters summary, heatmap and top posts by platform", () => {
    repo.writeSnapshot(snapshotFor("2026-06-15"));
    expect(repo.getSummary(7, "linkedin")).toEqual([]);
    expect(repo.getHeatmap("linkedin")).toEqual([]);
    expect(repo.getTopPosts(7, "linkedin")).toEqual([]);
    expect(repo.getSummary(7, "instagram")).toHaveLength(4);
  });

  it("is idempotent: re-writing a day replaces, never duplicates", () => {
    repo.writeSnapshot(snapshotFor("2026-06-15"));
    repo.writeSnapshot(snapshotFor("2026-06-15"));
    expect(repo.getSummary(7)).toHaveLength(4);
    expect(repo.getTopPosts(7)).toHaveLength(1);
  });

  it("serves the engagement series newest-last", () => {
    repo.writeSnapshot(snapshotFor("2026-06-14"));
    repo.writeSnapshot(snapshotFor("2026-06-15"));
    const series = repo.getEngagementSeries(7);
    expect(series.map((r) => r.capturedFor)).toEqual(["2026-06-14", "2026-06-15"]);
  });

  it("clamps a forged negative or non-finite top-posts limit to the default", () => {
    repo.writeSnapshot(snapshotFor("2026-06-15"));
    expect(repo.getTopPosts(7, undefined, -1)).toHaveLength(1);
    expect(repo.getTopPosts(7, undefined, Number.POSITIVE_INFINITY)).toHaveLength(1);
    expect(repo.getEngagementSeries(7, undefined, -5)).toHaveLength(1);
  });

  it("returns empties when the cache is cold", () => {
    expect(repo.latestCapturedFor()).toBeNull();
    expect(repo.getSummary(7)).toEqual([]);
    expect(repo.getHeatmap()).toEqual([]);
    expect(repo.getTopPosts(7)).toEqual([]);
  });
});
