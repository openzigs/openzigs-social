import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../db/index.js";
import { SocialBrainRepository } from "../../platform/index.js";
import { LinkedInCommentPoller } from "./comment-poller.js";
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

const POST_URN = "urn:li:share:1";

describe("LinkedInCommentPoller", () => {
  let db: Database;
  let brain: SocialBrainRepository;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    brain = new SocialBrainRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("persists comments into SocialBrain", async () => {
    const client = fakeClient([
      {
        elements: [
          {
            $URN: "urn:li:comment:1",
            actor: "urn:li:person:alice",
            message: { text: "great post" },
            created: { time: 1700000000000 }
          },
          { id: "urn:li:comment:2", actor: "urn:li:person:bob", message: { text: "agree" } }
        ]
      }
    ]);
    const poller = new LinkedInCommentPoller({
      client,
      brain,
      dispatcher: passthroughDispatcher()
    });

    const result = await poller.poll("tok", POST_URN);

    expect(result).toEqual({ comments: 2 });
    const c1 = brain.getMessageByPlatformId("linkedin", "urn:li:comment:1");
    expect(c1?.body).toBe("great post");
    expect(c1?.direction).toBe("inbound");
    expect(brain.getMessageByPlatformId("linkedin", "urn:li:comment:2")?.body).toBe("agree");
  });

  it("is idempotent across polls", async () => {
    const payload = {
      elements: [{ $URN: "urn:li:comment:1", actor: "a", message: { text: "hi" } }]
    };
    const client = fakeClient([payload, payload]);
    const poller = new LinkedInCommentPoller({
      client,
      brain,
      dispatcher: passthroughDispatcher()
    });

    expect((await poller.poll("tok", POST_URN)).comments).toBe(1);
    expect((await poller.poll("tok", POST_URN)).comments).toBe(0);
  });

  it("skips comments with no id", async () => {
    const client = fakeClient([{ elements: [{ message: { text: "no id" } }] }]);
    const poller = new LinkedInCommentPoller({
      client,
      brain,
      dispatcher: passthroughDispatcher()
    });
    expect((await poller.poll("tok", POST_URN)).comments).toBe(0);
  });

  it("handles an empty element list", async () => {
    const client = fakeClient([{}]);
    const poller = new LinkedInCommentPoller({
      client,
      brain,
      dispatcher: passthroughDispatcher()
    });
    expect((await poller.poll("tok", POST_URN)).comments).toBe(0);
  });

  it("propagates a dispatcher failure", async () => {
    const failing = {
      dispatch: vi.fn(async () => ({ ok: false, attempts: 1, error: new Error("rl"), dlqId: 1 }))
    } as unknown as LinkedInDispatcher;
    const poller = new LinkedInCommentPoller({
      client: fakeClient([{}]),
      brain,
      dispatcher: failing
    });
    await expect(poller.poll("tok", POST_URN)).rejects.toThrow("rl");
  });
});
