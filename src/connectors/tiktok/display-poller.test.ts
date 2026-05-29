import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../db/index.js";
import { InsightsRepository } from "../meta/insights/repository.js";
import { TikTokDisplayPoller } from "./display-poller.js";
import type { TikTokDispatcher } from "./dispatcher.js";
import type { TikTokRestClient } from "./rest-client.js";

function passthroughDispatcher(): TikTokDispatcher {
  return {
    dispatch: vi.fn(async (_op: unknown, run: () => Promise<unknown>) => ({
      ok: true,
      value: await run(),
      attempts: 1
    }))
  } as unknown as TikTokDispatcher;
}

function fakeClient(responses: unknown[]): TikTokRestClient {
  const queue = [...responses];
  const next = vi.fn(async () => queue.shift() ?? {});
  return { get: next, post: next } as unknown as TikTokRestClient;
}

const OPEN_ID = "oid-1";
const FIXED = new Date("2025-03-04T12:00:00Z");

describe("TikTokDisplayPoller", () => {
  let db: Database;
  let insights: InsightsRepository;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    insights = new InsightsRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function build(responses: unknown[]) {
    return new TikTokDisplayPoller({
      client: fakeClient(responses),
      insights,
      dispatcher: passthroughDispatcher(),
      now: () => FIXED
    });
  }

  it("records follower count as an account/followers metric", async () => {
    const poller = build([{ user: { follower_count: 999 } }]);

    const count = await poller.pollUserInfo("tok", OPEN_ID);

    expect(count).toBe(999);
    const rows = insights.listByObject("tiktok", "account", OPEN_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ metric: "followers", value: 999, capturedFor: "2025-03-04" });
  });

  it("returns undefined when user info lacks a follower count", async () => {
    const poller = build([{ user: {} }]);
    await expect(poller.pollUserInfo("tok", OPEN_ID)).resolves.toBeUndefined();
    expect(insights.listByObject("tiktok", "account", OPEN_ID)).toHaveLength(0);
  });

  it("records engagement metrics for each video", async () => {
    const poller = build([
      {
        videos: [
          { id: "v1", view_count: 10, like_count: 2, comment_count: 1, share_count: 3 },
          { id: "v2", view_count: 5 }
        ]
      }
    ]);

    const recorded = await poller.pollVideos("tok");

    expect(recorded).toBe(2);
    const v1 = insights.listByObject("tiktok", "video", "v1");
    expect(v1).toHaveLength(4);
    expect(v1.find((r) => r.metric === "views")?.value).toBe(10);
    const v2 = insights.listByObject("tiktok", "video", "v2");
    expect(v2.find((r) => r.metric === "likes")?.value).toBe(0);
  });

  it("skips videos without an id and is idempotent on repeat polls", async () => {
    const payload = { videos: [{ id: "v1", view_count: 7 }, { view_count: 99 }] };
    const poller = build([payload, payload]);

    await poller.pollVideos("tok");
    await poller.pollVideos("tok");

    const rows = insights.listByObject("tiktok", "video", "v1");
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.metric === "views")?.value).toBe(7);
  });
});
