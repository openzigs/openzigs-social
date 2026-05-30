import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../db/index.js";
import type { RateLimitBroker, DlqRepository, DlqInput, DlqEntry } from "../../platform/index.js";
import { TwitterCreditTracker } from "./credit-tracker.js";
import { TwitterDispatcher } from "./dispatcher.js";
import { TwitterPublisher } from "./publisher.js";
import { TwitterQuotaExceededError, TwitterQuotaGuard } from "./quota-guard.js";
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

describe("TwitterPublisher", () => {
  let db: Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
  });

  afterEach(() => {
    db.close();
  });

  function build(fetchImpl: FetchLike, cap = 100) {
    const client = new TwitterRestClient({ fetchImpl });
    const dispatcher = new TwitterDispatcher({ broker: grantingBroker(), dlq: fakeDlq() });
    const tracker = new TwitterCreditTracker({ db, now: clock });
    const quota = new TwitterQuotaGuard({ tracker, cap });
    return { publisher: new TwitterPublisher({ client, dispatcher, quota }), tracker };
  }

  it("publishes a tweet and records the write credit", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ data: { id: "111" } }));
    const { publisher, tracker } = build(fetchImpl);

    const res = await publisher.publish("tok", { text: "hello" });

    expect(res).toEqual({ tweetId: "111" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain("/tweets");
    expect(init?.body).toBe(JSON.stringify({ text: "hello" }));
    expect(tracker.usedThisMonth("2026-05")).toBe(1);
  });

  it("publishes a reply with the in_reply_to field", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ data: { id: "222" } }));
    const { publisher } = build(fetchImpl);

    const res = await publisher.reply("tok", { text: "re", inReplyToTweetId: "100" });

    expect(res).toEqual({ tweetId: "222" });
    expect(fetchImpl.mock.calls[0]![1]?.body).toBe(
      JSON.stringify({ text: "re", reply: { in_reply_to_tweet_id: "100" } })
    );
  });

  it("blocks (and never calls the API) when the monthly cap is reached", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ data: { id: "1" } }));
    const { publisher, tracker } = build(fetchImpl, 1);
    tracker.record({ kind: "tweet", dedupeKey: "seed", amount: 1 });

    await expect(publisher.publish("tok", { text: "nope" })).rejects.toBeInstanceOf(
      TwitterQuotaExceededError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws when the API returns no tweet id", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ data: {} }));
    const { publisher } = build(fetchImpl);
    await expect(publisher.publish("tok", { text: "x" })).rejects.toThrow(/no tweet id/);
  });
});
