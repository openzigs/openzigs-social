import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../db/index.js";
import {
  SocialBrainRepository,
  type RateLimitBroker,
  type DlqRepository,
  type DlqInput,
  type DlqEntry
} from "../../platform/index.js";
import { TwitterCreditTracker } from "./credit-tracker.js";
import { TwitterDispatcher } from "./dispatcher.js";
import { TwitterDmDisabledError, TwitterDmPoller, TwitterDmSender } from "./dm.js";
import { TwitterQuotaGuard } from "./quota-guard.js";
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

describe("TwitterDmSender (gating)", () => {
  let db: Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
  });

  afterEach(() => {
    db.close();
  });

  function build(enabled: boolean, fetchImpl: FetchLike) {
    const client = new TwitterRestClient({ fetchImpl });
    const dispatcher = new TwitterDispatcher({ broker: grantingBroker(), dlq: fakeDlq() });
    const tracker = new TwitterCreditTracker({ db, now: clock });
    const quota = new TwitterQuotaGuard({ tracker, cap: 100 });
    return new TwitterDmSender({
      client,
      dispatcher,
      enabled,
      getAccount: async () => ({ accessToken: "tok" }),
      quota,
      now: () => 1_700_000_000_000
    });
  }

  it("supports nothing and throws when DM is disabled (Free tier fail-closed)", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({}));
    const sender = build(false, fetchImpl);

    expect(sender.supports("twitter")).toBe(false);
    expect(sender.supports("x")).toBe(false);
    await expect(
      sender.sendDm({ platform: "twitter", recipientId: "42", text: "hi" })
    ).rejects.toBeInstanceOf(TwitterDmDisabledError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("supports the X platform keys and sends a DM when enabled", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ data: { dm_event_id: "ev1", dm_conversation_id: "c1" } })
    );
    const sender = build(true, fetchImpl);

    expect(sender.supports("twitter")).toBe(true);
    expect(sender.supports("X")).toBe(true);
    expect(sender.supports("linkedin")).toBe(false);

    const result = await sender.sendDm({ platform: "twitter", recipientId: "42", text: "yo" });

    expect(result).toMatchObject({ platform: "twitter", recipientId: "42", messageId: "ev1" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain("/dm_conversations/with/42/messages");
    expect(init?.body).toBe(JSON.stringify({ text: "yo" }));
  });

  it("records a DM write credit on success", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ data: { dm_event_id: "ev2" } }));
    const tracker = new TwitterCreditTracker({ db, now: clock });
    const client = new TwitterRestClient({ fetchImpl });
    const dispatcher = new TwitterDispatcher({ broker: grantingBroker(), dlq: fakeDlq() });
    const sender = new TwitterDmSender({
      client,
      dispatcher,
      enabled: true,
      getAccount: async () => ({ accessToken: "tok" }),
      quota: new TwitterQuotaGuard({ tracker, cap: 100 })
    });

    await sender.sendDm({ platform: "twitter", recipientId: "7", text: "hi" });
    expect(tracker.usedThisMonth("2026-05")).toBe(1);
  });
});

describe("TwitterDmPoller", () => {
  let db: Database;
  let brain: SocialBrainRepository;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    brain = new SocialBrainRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  function build(enabled: boolean, fetchImpl: FetchLike) {
    const client = new TwitterRestClient({ fetchImpl });
    const dispatcher = new TwitterDispatcher({ broker: grantingBroker(), dlq: fakeDlq() });
    return new TwitterDmPoller({ client, brain, dispatcher, enabled });
  }

  it("is a no-op when DM is disabled", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ data: [] }));
    const poller = build(false, fetchImpl);
    expect(await poller.poll("tok")).toEqual({ messages: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ingests inbound DM events into SocialBrain idempotently", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({
        data: [
          {
            id: "m1",
            event_type: "MessageCreate",
            text: "hello",
            sender_id: "u1",
            dm_conversation_id: "conv1",
            created_at: "2026-05-15T10:00:00Z"
          }
        ]
      })
    );
    const poller = build(true, fetchImpl);

    expect(await poller.poll("tok")).toEqual({ messages: 1 });
    expect(brain.getMessageByPlatformId("twitter", "m1")).toBeDefined();

    // Re-poll the same event: idempotent, no new message.
    expect(await poller.poll("tok")).toEqual({ messages: 0 });
  });
});
