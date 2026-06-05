/**
 * YouTube quota router tests (epic #58).
 */
import type { Database } from "better-sqlite3";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../../db/index.js";
import { Metrics } from "../metrics.js";
import { createApp } from "../app.js";
import { createYouTubeRouter } from "./router.js";
import { recordQuotaUsage, YOUTUBE_DAILY_QUOTA } from "../../connectors/youtube/quota.js";

function listen(app: ReturnType<typeof createApp>): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

describe("YouTube quota router", () => {
  let db: Database;
  let server: Server;
  let base: string;

  beforeEach(async () => {
    db = openDb({ path: ":memory:" });
    const router = createYouTubeRouter({ db });
    const app = createApp({
      metrics: new Metrics(),
      checkReadiness: () => ({ db: true, config: true, vault: true }),
      youtubeRouter: router
    });
    const started = await listen(app);
    server = started.server;
    base = started.base;
  });

  afterEach(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          db.close();
          err ? reject(err) : resolve();
        });
      })
  );

  it("GET /api/youtube/quota returns 200 with day_utc, used, limit, pct", async () => {
    const today = new Date().toISOString().slice(0, 10);
    recordQuotaUsage(db, 500, today);

    const res = await fetch(`${base}/api/youtube/quota`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      day_utc: string;
      used: number;
      limit: number;
      pct: number;
    };
    expect(body.day_utc).toBe(today);
    expect(body.used).toBe(500);
    expect(body.limit).toBe(YOUTUBE_DAILY_QUOTA);
    expect(body.pct).toBeCloseTo(5, 1);
  });

  it("returns used=0 when no quota recorded today", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`${base}/api/youtube/quota`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { day_utc: string; used: number; pct: number };
    expect(body.day_utc).toBe(today);
    expect(body.used).toBe(0);
    expect(body.pct).toBe(0);
  });

  it("returns pct=100 when quota is fully consumed", async () => {
    const today = new Date().toISOString().slice(0, 10);
    recordQuotaUsage(db, YOUTUBE_DAILY_QUOTA, today);

    const res = await fetch(`${base}/api/youtube/quota`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pct: number };
    expect(body.pct).toBe(100);
  });

  it("caps pct at 100 when used exceeds limit", async () => {
    const today = new Date().toISOString().slice(0, 10);
    recordQuotaUsage(db, YOUTUBE_DAILY_QUOTA + 1000, today);

    const res = await fetch(`${base}/api/youtube/quota`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pct: number };
    expect(body.pct).toBe(100);
  });
});
