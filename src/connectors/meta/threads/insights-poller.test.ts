import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../../db/index.js";
import type { MetaDispatcher } from "../dispatcher.js";
import type { MetaGraphClient } from "../graph-client.js";
import { InsightsRepository } from "../insights/repository.js";
import { DEFAULT_THREADS_METRICS, ThreadsInsightsPoller } from "./insights-poller.js";
import type { ThreadsAccount } from "./publisher.js";

const account: ThreadsAccount = { threadsUserId: "th-1", accessToken: "tok" };

function passthroughDispatcher(): MetaDispatcher {
  return {
    dispatch: vi.fn(async (_op: unknown, run: () => Promise<unknown>) => ({
      ok: true,
      value: await run(),
      attempts: 1
    }))
  } as unknown as MetaDispatcher;
}

describe("ThreadsInsightsPoller", () => {
  let db: Database;
  let insights: InsightsRepository;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    insights = new InsightsRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("requests the default metric set", async () => {
    let query: Record<string, unknown> | undefined;
    const client = {
      get: vi.fn(async (_path: string, o: { query?: Record<string, unknown> }) => {
        query = o.query;
        return { data: [] };
      })
    } as unknown as MetaGraphClient;
    const poller = new ThreadsInsightsPoller({
      client,
      insights,
      dispatcher: passthroughDispatcher()
    });
    await poller.poll(account, "m1");
    expect(query?.metric).toBe(DEFAULT_THREADS_METRICS.join(","));
  });

  it("records the latest value for each metric", async () => {
    const client = {
      get: vi.fn(async () => ({
        data: [
          {
            name: "views",
            values: [
              { value: 10, end_time: "t1" },
              { value: 25, end_time: "t2" }
            ]
          },
          { name: "likes", values: [{ value: 4, end_time: "t2" }] }
        ]
      }))
    } as unknown as MetaGraphClient;
    const poller = new ThreadsInsightsPoller({
      client,
      insights,
      dispatcher: passthroughDispatcher()
    });

    const result = await poller.poll(account, "m1");
    expect(result).toEqual({ metrics: 2 });

    const stored = insights.listByObject("threads", "media", "m1");
    const views = stored.find((s) => s.metric === "views");
    expect(views?.value).toBe(25);
    expect(views?.capturedFor).toBe("t2");
  });

  it("stores a null value when no metric values are returned", async () => {
    const client = {
      get: vi.fn(async () => ({ data: [{ name: "views" }, { values: [] }] }))
    } as unknown as MetaGraphClient;
    const poller = new ThreadsInsightsPoller({
      client,
      insights,
      dispatcher: passthroughDispatcher()
    });
    const result = await poller.poll(account, "m1");
    expect(result).toEqual({ metrics: 1 }); // entry without a name skipped
    const stored = insights.listByObject("threads", "media", "m1");
    expect(stored[0].value).toBeUndefined();
    expect(stored[0].capturedFor).toBe("lifetime");
  });

  it("honours a custom metric list", async () => {
    let query: Record<string, unknown> | undefined;
    const client = {
      get: vi.fn(async (_p: string, o: { query?: Record<string, unknown> }) => {
        query = o.query;
        return { data: [] };
      })
    } as unknown as MetaGraphClient;
    const poller = new ThreadsInsightsPoller({
      client,
      insights,
      dispatcher: passthroughDispatcher(),
      metrics: ["views"]
    });
    await poller.poll(account, "m1");
    expect(query?.metric).toBe("views");
  });

  it("propagates a dispatcher failure", async () => {
    const failing = {
      dispatch: vi.fn(async () => ({ ok: false, attempts: 1, error: new Error("rl"), dlqId: 1 }))
    } as unknown as MetaDispatcher;
    const poller = new ThreadsInsightsPoller({
      client: {} as MetaGraphClient,
      insights,
      dispatcher: failing
    });
    await expect(poller.poll(account, "m1")).rejects.toThrow("rl");
  });
});
