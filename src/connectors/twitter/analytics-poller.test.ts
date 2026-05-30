import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../db/index.js";
import type { RateLimitBroker, DlqRepository, DlqInput, DlqEntry } from "../../platform/index.js";
import { InsightsRepository } from "../meta/insights/repository.js";
import { TwitterAnalyticsPoller } from "./analytics-poller.js";
import { TwitterDispatcher } from "./dispatcher.js";
import { TwitterRestClient, type FetchLike } from "./rest-client.js";

function grantingBroker(): RateLimitBroker {
  return { acquire: vi.fn(async () => ({ granted: true })) } as unknown as RateLimitBroker;
}

function fakeDlq(): DlqRepository {
  let id = 0;
  return {
    land: vi.fn((input: DlqInput): DlqEntry => {
      id += 1;
      return {
        id,
        platform: input.platform,
        opKind: input.opKind,
        payloadJson: "null",
        lastError: input.lastError,
        attempts: input.attempts,
        createdAt: "now"
      };
    })
  } as unknown as DlqRepository;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

const clock = () => new Date("2026-05-15T12:00:00.000Z");

describe("TwitterAnalyticsPoller", () => {
  let db: Database;
  let insights: InsightsRepository;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    insights = new InsightsRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function build(fetchImpl: FetchLike) {
    const client = new TwitterRestClient({ fetchImpl });
    const dispatcher = new TwitterDispatcher({ broker: grantingBroker(), dlq: fakeDlq() });
    return new TwitterAnalyticsPoller({ client, insights, dispatcher, now: clock });
  }

  it("records the follower count for an account", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ data: { id: "u1", public_metrics: { followers_count: 4321 } } })
    );
    const poller = build(fetchImpl);

    const followers = await poller.pollFollowers("tok", "u1");

    expect(followers).toBe(4321);
    const readings = insights.listByObject("twitter", "account", "u1");
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({
      metric: "followers",
      value: 4321,
      capturedFor: "2026-05-15"
    });
  });

  it("returns undefined and records nothing when metrics are absent", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ data: { id: "u1" } }));
    const poller = build(fetchImpl);
    expect(await poller.pollFollowers("tok", "u1")).toBeUndefined();
    expect(insights.listByObject("twitter", "account", "u1")).toHaveLength(0);
  });

  it("records the five public tweet metrics", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({
        data: {
          id: "t1",
          public_metrics: {
            like_count: 10,
            retweet_count: 3,
            reply_count: 2,
            quote_count: 1,
            impression_count: 999
          }
        }
      })
    );
    const poller = build(fetchImpl);

    await poller.pollTweetMetrics("tok", "t1");

    const readings = insights.listByObject("twitter", "tweet", "t1");
    const byMetric = Object.fromEntries(readings.map((r) => [r.metric, r.value]));
    expect(byMetric).toEqual({
      likes: 10,
      retweets: 3,
      replies: 2,
      quotes: 1,
      impressions: 999
    });
  });

  it("defaults missing tweet metrics to zero", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ data: { id: "t2" } }));
    const poller = build(fetchImpl);
    await poller.pollTweetMetrics("tok", "t2");
    const readings = insights.listByObject("twitter", "tweet", "t2");
    expect(readings.every((r) => r.value === 0)).toBe(true);
  });
});
