import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../db/index.js";
import { InsightsRepository } from "../meta/insights/repository.js";
import { LinkedInAnalyticsPoller } from "./analytics-poller.js";
import type { LinkedInDispatcher } from "./dispatcher.js";
import type { LinkedInRestClient } from "./rest-client.js";

function passthroughDispatcher(): LinkedInDispatcher {
  return {
    dispatch: vi.fn(async (_op: unknown, run: () => Promise<unknown>) => ({
      ok: true,
      value: await run(),
      attempts: 1
    }))
  } as unknown as LinkedInDispatcher;
}

function fakeClient(responses: unknown[]): LinkedInRestClient {
  const queue = [...responses];
  return { get: vi.fn(async () => queue.shift() ?? {}) } as unknown as LinkedInRestClient;
}

const ORG = "urn:li:organization:1";
const POST = "urn:li:share:9";
const FIXED = new Date("2025-03-04T12:00:00Z");

describe("LinkedInAnalyticsPoller", () => {
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
    return new LinkedInAnalyticsPoller({
      client: fakeClient(responses),
      insights,
      dispatcher: passthroughDispatcher(),
      now: () => FIXED
    });
  }

  it("records follower count as an account/followers metric", async () => {
    const poller = build([{ firstDegreeSize: 4321 }]);

    const count = await poller.pollFollowers("tok", ORG);

    expect(count).toBe(4321);
    const rows = insights.listByObject("linkedin", "account", ORG);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ metric: "followers", value: 4321, capturedFor: "2025-03-04" });
  });

  it("returns undefined and records nothing when follower count is missing", async () => {
    const poller = build([{}]);
    expect(await poller.pollFollowers("tok", ORG)).toBeUndefined();
    expect(insights.listByObject("linkedin", "account", ORG)).toHaveLength(0);
  });

  it("is idempotent for follower readings within the same window", async () => {
    await build([{ firstDegreeSize: 100 }]).pollFollowers("tok", ORG);
    await build([{ firstDegreeSize: 150 }]).pollFollowers("tok", ORG);
    const rows = insights.listByObject("linkedin", "account", ORG);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe(150);
  });

  it("records post like/comment engagement", async () => {
    const poller = build([
      { likesSummary: { totalLikes: 12 }, commentsSummary: { aggregatedTotalComments: 3 } }
    ]);

    await poller.pollPostInsights("tok", POST);

    const rows = insights.listByObject("linkedin", "post", POST);
    const byMetric = Object.fromEntries(rows.map((r) => [r.metric, r.value]));
    expect(byMetric.likes).toBe(12);
    expect(byMetric.comments).toBe(3);
  });

  it("defaults missing engagement counts to zero", async () => {
    const poller = build([{}]);
    await poller.pollPostInsights("tok", POST);
    const rows = insights.listByObject("linkedin", "post", POST);
    expect(rows.every((r) => r.value === 0)).toBe(true);
  });
});
