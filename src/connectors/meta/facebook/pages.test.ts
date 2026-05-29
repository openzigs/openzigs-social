import { describe, expect, it, vi } from "vitest";

import type { MetaDispatcher } from "../dispatcher.js";
import type { MetaGraphClient } from "../graph-client.js";
import { FacebookPages, type FbPage } from "./pages.js";

const page: FbPage = { pageId: "page-1", accessToken: "page-tok", name: "My Page" };

function passthroughDispatcher(): MetaDispatcher {
  return {
    dispatch: vi.fn(async (_op: unknown, run: () => Promise<unknown>) => ({
      ok: true,
      value: await run(),
      attempts: 1
    }))
  } as unknown as MetaDispatcher;
}

interface Call {
  path: string;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

function fakeClient(responses: { get?: unknown[]; post?: unknown[] }): {
  client: MetaGraphClient;
  calls: Call[];
} {
  const calls: Call[] = [];
  const getQ = [...(responses.get ?? [])];
  const postQ = [...(responses.post ?? [])];
  const client = {
    get: vi.fn(async (path: string, o: { query?: Record<string, unknown> }) => {
      calls.push({ path, query: o.query });
      return getQ.shift() ?? {};
    }),
    post: vi.fn(async (path: string, o: { body?: Record<string, unknown> }) => {
      calls.push({ path, body: o.body });
      return postQ.shift() ?? {};
    })
  } as unknown as MetaGraphClient;
  return { client, calls };
}

describe("FacebookPages", () => {
  it("lists pages with their tokens", async () => {
    const { client } = fakeClient({
      get: [
        {
          data: [
            { id: "p1", name: "Page One", access_token: "tok-1" },
            { id: "p2", access_token: "tok-2" },
            { id: "no-token" } // filtered out (no token)
          ]
        }
      ]
    });
    const fb = new FacebookPages({ client, dispatcher: passthroughDispatcher() });
    const pages = await fb.listPages("user-tok");
    expect(pages).toEqual([
      { pageId: "p1", name: "Page One", accessToken: "tok-1" },
      { pageId: "p2", accessToken: "tok-2" }
    ]);
  });

  it("creates a post with a message and link", async () => {
    const { client, calls } = fakeClient({ post: [{ id: "post-1" }] });
    const fb = new FacebookPages({ client, dispatcher: passthroughDispatcher() });
    const res = await fb.createPost(page, { message: "hi", link: "https://x.test" });
    expect(res).toEqual({ id: "post-1" });
    expect(calls[0]).toEqual({
      path: "/page-1/feed",
      body: { message: "hi", link: "https://x.test" }
    });
  });

  it("rejects an empty post", async () => {
    const { client } = fakeClient({});
    const fb = new FacebookPages({ client, dispatcher: passthroughDispatcher() });
    await expect(fb.createPost(page, {})).rejects.toThrow(/message or a link/);
  });

  it("reads comments", async () => {
    const { client } = fakeClient({
      get: [
        {
          data: [
            { id: "c1", message: "great", from: { id: "u1", name: "Al" }, created_time: "t1" },
            { message: "no id" } // filtered
          ]
        }
      ]
    });
    const fb = new FacebookPages({ client, dispatcher: passthroughDispatcher() });
    const comments = await fb.listComments(page, "post-1");
    expect(comments).toEqual([
      { id: "c1", message: "great", from: { id: "u1", name: "Al" }, createdTime: "t1" }
    ]);
  });

  it("replies to an object", async () => {
    const { client, calls } = fakeClient({ post: [{ id: "reply-1" }] });
    const fb = new FacebookPages({ client, dispatcher: passthroughDispatcher() });
    const res = await fb.reply(page, "post-1", "thanks");
    expect(res).toEqual({ id: "reply-1" });
    expect(calls[0]).toEqual({ path: "/post-1/comments", body: { message: "thanks" } });
  });

  it("reads comments that omit every optional field", async () => {
    const { client } = fakeClient({ get: [{ data: [{ id: "c-bare" }] }] });
    const fb = new FacebookPages({ client, dispatcher: passthroughDispatcher() });
    const comments = await fb.listComments(page, "post-1");
    expect(comments).toEqual([{ id: "c-bare" }]);
  });

  it("returns an empty list when comments have no data array", async () => {
    const { client } = fakeClient({ get: [{}] });
    const fb = new FacebookPages({ client, dispatcher: passthroughDispatcher() });
    expect(await fb.listComments(page, "post-1")).toEqual([]);
  });

  it("reads insights that omit period and values", async () => {
    const { client } = fakeClient({ get: [{ data: [{ name: "reach" }] }] });
    const fb = new FacebookPages({ client, dispatcher: passthroughDispatcher() });
    const insights = await fb.getInsights(page, "page-1", ["reach"]);
    expect(insights).toEqual([{ name: "reach", values: [] }]);
  });

  it("reads insights", async () => {
    const { client, calls } = fakeClient({
      get: [
        {
          data: [
            {
              name: "page_impressions",
              period: "day",
              values: [{ value: 10, end_time: "t1" }, { value: 12 }]
            },
            { period: "day" } // filtered (no name)
          ]
        }
      ]
    });
    const fb = new FacebookPages({ client, dispatcher: passthroughDispatcher() });
    const insights = await fb.getInsights(page, "page-1", ["page_impressions"]);
    expect(insights).toEqual([
      {
        name: "page_impressions",
        period: "day",
        values: [{ value: 10, endTime: "t1" }, { value: 12 }]
      }
    ]);
    expect(calls[0].query).toMatchObject({ metric: "page_impressions" });
  });

  it("requires at least one insights metric", async () => {
    const { client } = fakeClient({});
    const fb = new FacebookPages({ client, dispatcher: passthroughDispatcher() });
    await expect(fb.getInsights(page, "p", [])).rejects.toThrow(/at least one/);
  });

  it("propagates a dispatcher failure on post", async () => {
    const failing = {
      dispatch: vi.fn(async () => ({ ok: false, attempts: 1, error: new Error("nope"), dlqId: 1 }))
    } as unknown as MetaDispatcher;
    const { client } = fakeClient({ post: [] });
    const fb = new FacebookPages({ client, dispatcher: failing });
    await expect(fb.createPost(page, { message: "x" })).rejects.toThrow("nope");
  });
});
