import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../../db/index.js";
import { SocialBrainRepository } from "../../../platform/index.js";
import type { MetaDispatcher } from "../dispatcher.js";
import type { MetaGraphClient } from "../graph-client.js";
import { InstagramInboxPoller } from "./inbox-poller.js";
import type { IgAccount } from "./publisher.js";

const account: IgAccount = { igUserId: "ig-1", accessToken: "tok" };

function passthroughDispatcher(): MetaDispatcher {
  return {
    dispatch: vi.fn(async (_op: unknown, run: () => Promise<unknown>) => ({
      ok: true,
      value: await run(),
      attempts: 1
    }))
  } as unknown as MetaDispatcher;
}

function fakeClient(getResponses: unknown[]): MetaGraphClient {
  const queue = [...getResponses];
  return {
    get: vi.fn(async () => queue.shift() ?? {})
  } as unknown as MetaGraphClient;
}

describe("InstagramInboxPoller", () => {
  let db: Database;
  let brain: SocialBrainRepository;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    brain = new SocialBrainRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("persists conversations and messages into SocialBrain", async () => {
    const client = fakeClient([
      {
        data: [
          {
            id: "conv-1",
            messages: {
              data: [
                {
                  id: "m1",
                  message: "hello",
                  created_time: "2025-01-01T00:00:00+0000",
                  from: { id: "fan-1", username: "fan" },
                  to: { data: [{ id: "ig-1", username: "me" }] }
                },
                {
                  id: "m2",
                  message: "thanks",
                  from: { id: "ig-1", username: "me" },
                  to: { data: [{ id: "fan-1", username: "fan" }] }
                }
              ]
            }
          }
        ]
      }
    ]);
    const poller = new InstagramInboxPoller({ client, brain, dispatcher: passthroughDispatcher() });

    const result = await poller.poll(account);
    expect(result).toEqual({ conversations: 1, messages: 2 });

    const inbound = brain.getMessageByPlatformId("instagram", "m1");
    expect(inbound?.direction).toBe("inbound");
    expect(inbound?.body).toBe("hello");

    const outbound = brain.getMessageByPlatformId("instagram", "m2");
    expect(outbound?.direction).toBe("outbound");
  });

  it("is idempotent across repeated polls", async () => {
    const convo = {
      data: [
        {
          id: "conv-1",
          messages: { data: [{ id: "m1", message: "hi", from: { id: "fan-1", username: "fan" } }] }
        }
      ]
    };
    const client = fakeClient([convo, convo]);
    const poller = new InstagramInboxPoller({ client, brain, dispatcher: passthroughDispatcher() });

    const first = await poller.poll(account);
    const second = await poller.poll(account);
    expect(first.messages).toBe(1);
    expect(second.messages).toBe(0); // already stored

    const thread = brain.upsertThread({ platform: "instagram", platformThreadId: "conv-1" });
    expect(brain.listMessagesByThread(thread.id)).toHaveLength(1);
  });

  it("skips conversations and messages with missing ids", async () => {
    const client = fakeClient([
      {
        data: [
          { messages: { data: [{ id: "x", message: "ok", from: { id: "fan", username: "f" } }] } },
          { id: "conv-2", messages: { data: [{ message: "no id" }] } }
        ]
      }
    ]);
    const poller = new InstagramInboxPoller({ client, brain, dispatcher: passthroughDispatcher() });
    const result = await poller.poll(account);
    expect(result).toEqual({ conversations: 2, messages: 0 });
  });

  it("ingests comments for a media id", async () => {
    const client = fakeClient([
      {
        data: [
          { id: "c1", text: "nice!", username: "alice", timestamp: "2025-01-02T00:00:00+0000" },
          { id: "c2", text: "love it", from: { id: "bob-id", username: "bob" } }
        ]
      }
    ]);
    const poller = new InstagramInboxPoller({ client, brain, dispatcher: passthroughDispatcher() });

    const result = await poller.pollComments(account, "media-9");
    expect(result).toEqual({ comments: 2 });
    expect(brain.getMessageByPlatformId("instagram", "c1")?.body).toBe("nice!");
    expect(brain.getMessageByPlatformId("instagram", "c2")?.direction).toBe("inbound");
  });

  it("does not re-ingest the same comment", async () => {
    const comments = { data: [{ id: "c1", text: "hi", username: "alice" }] };
    const client = fakeClient([comments, comments]);
    const poller = new InstagramInboxPoller({ client, brain, dispatcher: passthroughDispatcher() });
    expect((await poller.pollComments(account, "m")).comments).toBe(1);
    expect((await poller.pollComments(account, "m")).comments).toBe(0);
  });

  it("throws when the dispatcher fails", async () => {
    const failing = {
      dispatch: vi.fn(async () => ({ ok: false, attempts: 1, error: new Error("rl"), dlqId: 1 }))
    } as unknown as MetaDispatcher;
    const poller = new InstagramInboxPoller({
      client: fakeClient([]),
      brain,
      dispatcher: failing
    });
    await expect(poller.poll(account)).rejects.toThrow("rl");
  });
});
