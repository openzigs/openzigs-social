import { describe, expect, it, vi } from "vitest";

import type { MetaDispatcher } from "../dispatcher.js";
import type { MetaGraphClient } from "../graph-client.js";
import {
  ThreadsContainerNotReadyError,
  ThreadsPublisher,
  type ThreadsAccount
} from "./publisher.js";

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

interface PostCall {
  path: string;
  body?: Record<string, unknown>;
}

function fakeClient(opts: { postResponses: Array<{ id: string }>; statusSequence?: string[] }): {
  client: MetaGraphClient;
  posts: PostCall[];
  gets: string[];
} {
  const posts: PostCall[] = [];
  const gets: string[] = [];
  const postQueue = [...opts.postResponses];
  const statusQueue = [...(opts.statusSequence ?? [])];
  const client = {
    post: vi.fn(async (path: string, o: { body?: Record<string, unknown> }) => {
      posts.push({ path, body: o.body });
      return postQueue.shift() ?? { id: "fallback" };
    }),
    get: vi.fn(async (path: string) => {
      gets.push(path);
      return { status: statusQueue.shift() ?? "FINISHED" };
    })
  } as unknown as MetaGraphClient;
  return { client, posts, gets };
}

describe("ThreadsPublisher", () => {
  it("publishes a text post without polling", async () => {
    const { client, posts, gets } = fakeClient({
      postResponses: [{ id: "c-1" }, { id: "media-1" }]
    });
    const publisher = new ThreadsPublisher({ client, dispatcher: passthroughDispatcher() });

    const result = await publisher.publish(account, { kind: "text", text: "hello threads" });
    expect(result).toEqual({ mediaId: "media-1" });
    expect(gets).toHaveLength(0);
    expect(posts[0]).toEqual({
      path: "/th-1/threads",
      body: { media_type: "TEXT", text: "hello threads" }
    });
    expect(posts[1]).toEqual({
      path: "/th-1/threads_publish",
      body: { creation_id: "c-1" }
    });
  });

  it("polls until FINISHED for an image post", async () => {
    const sleep = vi.fn(async () => undefined);
    const { client, posts, gets } = fakeClient({
      postResponses: [{ id: "c" }, { id: "m" }],
      statusSequence: ["IN_PROGRESS", "FINISHED"]
    });
    const publisher = new ThreadsPublisher({
      client,
      dispatcher: passthroughDispatcher(),
      sleep,
      pollIntervalMs: 10
    });

    const result = await publisher.publish(account, {
      kind: "image",
      imageUrl: "https://cdn/a.jpg",
      text: "caption"
    });
    expect(result).toEqual({ mediaId: "m" });
    expect(posts[0].body).toMatchObject({
      media_type: "IMAGE",
      image_url: "https://cdn/a.jpg",
      text: "caption"
    });
    expect(gets).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("uses media_type=VIDEO for a video post", async () => {
    const { client, posts } = fakeClient({
      postResponses: [{ id: "c" }, { id: "m" }],
      statusSequence: ["FINISHED"]
    });
    const publisher = new ThreadsPublisher({
      client,
      dispatcher: passthroughDispatcher(),
      sleep: async () => undefined
    });
    await publisher.publish(account, { kind: "video", videoUrl: "https://cdn/v.mp4" });
    expect(posts[0].body).toMatchObject({ media_type: "VIDEO", video_url: "https://cdn/v.mp4" });
  });

  it("throws when the container errors", async () => {
    const { client } = fakeClient({
      postResponses: [{ id: "c" }, { id: "m" }],
      statusSequence: ["ERROR"]
    });
    const publisher = new ThreadsPublisher({
      client,
      dispatcher: passthroughDispatcher(),
      sleep: async () => undefined
    });
    await expect(
      publisher.publish(account, { kind: "image", imageUrl: "https://cdn/a.jpg" })
    ).rejects.toBeInstanceOf(ThreadsContainerNotReadyError);
  });

  it("throws when the container never finishes", async () => {
    const { client } = fakeClient({
      postResponses: [{ id: "c" }, { id: "m" }],
      statusSequence: ["IN_PROGRESS"]
    });
    const publisher = new ThreadsPublisher({
      client,
      dispatcher: passthroughDispatcher(),
      sleep: async () => undefined,
      maxPollAttempts: 1
    });
    await expect(
      publisher.publish(account, { kind: "video", videoUrl: "https://cdn/v.mp4" })
    ).rejects.toThrow(/not ready after 1 polls/);
  });

  it("propagates a dispatcher failure", async () => {
    const failing = {
      dispatch: vi.fn(async () => ({ ok: false, attempts: 1, error: new Error("rl"), dlqId: 1 }))
    } as unknown as MetaDispatcher;
    const { client } = fakeClient({ postResponses: [] });
    const publisher = new ThreadsPublisher({ client, dispatcher: failing });
    await expect(publisher.publish(account, { kind: "text", text: "x" })).rejects.toThrow("rl");
  });
});
