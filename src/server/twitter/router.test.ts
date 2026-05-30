import { type Server } from "node:http";
import { type AddressInfo } from "node:net";

import express, { type Express } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "better-sqlite3";

import { openDb } from "../../db/index.js";
import { TwitterCreditTracker } from "../../connectors/twitter/credit-tracker.js";
import { createTwitterRouter } from "./router.js";

function listen(app: Express): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

describe("twitter quota router", () => {
  let db: Database;
  let server: Server;
  let base: string;

  async function mount(cap: number, tier: string): Promise<void> {
    const app = express();
    app.use("/api/twitter", createTwitterRouter({ db, cap, tier }));
    ({ server, base } = await listen(app));
  }

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
  });

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  it("reports zero usage against the tier cap when no writes exist", async () => {
    await mount(1_500, "free");
    const res = await fetch(`${base}/api/twitter/quota`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      timestamp: string;
      tier: string;
      quota: { used: number; cap: number; remaining: number; ratio: number };
    };
    expect(body.tier).toBe("free");
    expect(typeof body.timestamp).toBe("string");
    expect(body.quota.used).toBe(0);
    expect(body.quota.cap).toBe(1_500);
    expect(body.quota.remaining).toBe(1_500);
    expect(body.quota.ratio).toBe(0);
  });

  it("reflects recorded credit usage in the summary", async () => {
    const tracker = new TwitterCreditTracker({ db });
    tracker.record({ kind: "tweet", dedupeKey: "t1", amount: 400 });
    tracker.record({ kind: "reply", dedupeKey: "t2", amount: 100 });
    await mount(1_000, "basic");
    const res = await fetch(`${base}/api/twitter/quota`);
    const body = (await res.json()) as {
      quota: { used: number; remaining: number; ratio: number };
    };
    expect(body.quota.used).toBe(500);
    expect(body.quota.remaining).toBe(500);
    expect(body.quota.ratio).toBeCloseTo(0.5);
  });

  it("never leaks token material (only ledger aggregates)", async () => {
    await mount(1_500, "free");
    const res = await fetch(`${base}/api/twitter/quota`);
    const text = await res.text();
    expect(text).not.toContain("accessToken");
    expect(text).not.toContain("clientSecret");
  });
});
