import type { Database } from "better-sqlite3";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../../db/index.js";
import { AnalyticsCacheRepository } from "../../analytics/repository.js";
import type { HeatmapBucket, RollupRow, TopPost } from "../../analytics/types.js";
import { createApp } from "../app.js";
import { Metrics } from "../metrics.js";
import { createAnalyticsRouter } from "./router.js";

function listen(app: ReturnType<typeof createApp>): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

describe("analytics router", () => {
  let db: Database;
  let repo: AnalyticsCacheRepository;
  let server: Server;
  let base: string;

  beforeEach(async () => {
    db = openDb({ path: ":memory:" });
    repo = new AnalyticsCacheRepository(db);

    const capturedFor = "2026-06-15";
    const rollups: RollupRow[] = [
      { platform: "instagram", windowDays: 30, metric: "engagement", value: 90, capturedFor },
      { platform: "instagram", windowDays: 30, metric: "posts", value: 3, capturedFor },
      { platform: "instagram", windowDays: 30, metric: "impressions", value: 200, capturedFor },
      { platform: "instagram", windowDays: 30, metric: "followers", value: 500, capturedFor }
    ];
    const heatmap: HeatmapBucket[] = [
      { platform: "instagram", dayOfWeek: 1, hourOfDay: 12, count: 4 }
    ];
    const topPostsByWindow = new Map<number, TopPost[]>([
      [30, [{ platform: "instagram", externalId: "p1", engagement: 90, publishedAt: 1, rank: 1 }]]
    ]);
    repo.writeSnapshot({ capturedFor, rollups, heatmap, topPostsByWindow });

    const app = createApp({
      metrics: new Metrics(),
      checkReadiness: () => ({ db: true, config: true, vault: true }),
      analyticsRouter: createAnalyticsRouter({ repo })
    });
    ({ server, base } = await listen(app));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  function get(path: string): Promise<Response> {
    return fetch(`${base}${path}`);
  }

  it("GET /summary returns totals, perPlatform and avg, and is rate-limited", async () => {
    const res = await get("/api/analytics/summary?window=30");
    expect(res.status).toBe(200);
    expect(res.headers.get("ratelimit-limit")).toBe("60");
    const body = (await res.json()) as {
      totals: { engagement: number; posts: number; avgEngagementPerPost: number };
      perPlatform: { platform: string }[];
    };
    expect(body.totals.engagement).toBe(90);
    expect(body.totals.avgEngagementPerPost).toBe(30);
    expect(body.perPlatform[0]!.platform).toBe("instagram");
  });

  it("defaults the window to 30 when omitted", async () => {
    const res = await get("/api/analytics/summary");
    const body = (await res.json()) as { window: number };
    expect(body.window).toBe(30);
  });

  it("GET /engagement returns the series", async () => {
    const res = await get("/api/analytics/engagement?window=30");
    const body = (await res.json()) as { series: { platform: string; engagement: number }[] };
    expect(body.series).toEqual([
      { platform: "instagram", capturedFor: "2026-06-15", engagement: 90 }
    ]);
  });

  it("GET /heatmap returns buckets and a dense 7×24 matrix", async () => {
    const res = await get("/api/analytics/heatmap");
    const body = (await res.json()) as { buckets: unknown[]; matrix: number[][] };
    expect(body.buckets).toHaveLength(1);
    expect(body.matrix).toHaveLength(7);
    expect(body.matrix[1]![12]).toBe(4);
  });

  it("GET /top-posts returns the ranked leaderboard", async () => {
    const res = await get("/api/analytics/top-posts?window=30");
    const body = (await res.json()) as { posts: { externalId: string; rank: number }[] };
    expect(body.posts[0]).toMatchObject({ externalId: "p1", rank: 1 });
  });

  it("rejects an invalid window with 422", async () => {
    const res = await get("/api/analytics/summary?window=13");
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/window must be one of/);
  });

  it("rejects an exotic platform with 422", async () => {
    const res = await get("/api/analytics/heatmap?platform=DROP%20TABLE");
    expect(res.status).toBe(422);
  });

  it("rejects a non-positive limit/days with 422", async () => {
    expect((await get("/api/analytics/top-posts?window=30&limit=-1")).status).toBe(422);
    expect((await get("/api/analytics/engagement?window=30&days=0")).status).toBe(422);
  });
});
