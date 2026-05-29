import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../../db/index.js";
import { SocialBrainRepository } from "../../../platform/index.js";
import type { MetaDispatcher } from "../dispatcher.js";
import type { MetaGraphClient } from "../graph-client.js";
import { ThreadsReplyPoller } from "./reply-poller.js";
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

function fakeClient(getResponses: unknown[]): MetaGraphClient {
  const queue = [...getResponses];
  return { get: vi.fn(async () => queue.shift() ?? {}) } as unknown as MetaGraphClient;
}

describe("ThreadsReplyPoller", () => {
  let db: Database;
  let brain: SocialBrainRepository;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    brain = new SocialBrainRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("persists replies into SocialBrain", async () => {
    const client = fakeClient([
      {
        data: [
          { id: "r1", text: "nice", username: "alice", timestamp: "2025-01-01T00:00:00+0000" },
          { id: "r2", text: "cool", from: { id: "bob", username: "bob" } }
        ]
      }
    ]);
    const poller = new ThreadsReplyPoller({ client, brain, dispatcher: passthroughDispatcher() });

    const result = await poller.poll(account, "media-1");
    expect(result).toEqual({ replies: 2 });
    expect(brain.getMessageByPlatformId("threads", "r1")?.body).toBe("nice");
    expect(brain.getMessageByPlatformId("threads", "r2")?.direction).toBe("inbound");
  });

  it("is idempotent across polls", async () => {
    const replies = { data: [{ id: "r1", text: "hi", username: "alice" }] };
    const client = fakeClient([replies, replies]);
    const poller = new ThreadsReplyPoller({ client, brain, dispatcher: passthroughDispatcher() });
    expect((await poller.poll(account, "m")).replies).toBe(1);
    expect((await poller.poll(account, "m")).replies).toBe(0);
  });

  it("skips replies with no id", async () => {
    const client = fakeClient([{ data: [{ text: "no id" }] }]);
    const poller = new ThreadsReplyPoller({ client, brain, dispatcher: passthroughDispatcher() });
    expect((await poller.poll(account, "m")).replies).toBe(0);
  });

  it("propagates a dispatcher failure", async () => {
    const failing = {
      dispatch: vi.fn(async () => ({ ok: false, attempts: 1, error: new Error("rl"), dlqId: 1 }))
    } as unknown as MetaDispatcher;
    const poller = new ThreadsReplyPoller({ client: fakeClient([]), brain, dispatcher: failing });
    await expect(poller.poll(account, "m")).rejects.toThrow("rl");
  });
});
