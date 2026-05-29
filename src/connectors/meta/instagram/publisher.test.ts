import { describe, expect, it, vi } from "vitest";

import type { MetaDispatcher } from "../dispatcher.js";
import type { MetaGraphClient } from "../graph-client.js";
import { IgContainerNotReadyError, InstagramPublisher, type IgAccount } from "./publisher.js";

const account: IgAccount = { igUserId: "ig-1", accessToken: "tok" };

/** Dispatcher that simply runs the op (rate-limit/retry tested elsewhere). */
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
      return { status_code: statusQueue.shift() ?? "FINISHED" };
    })
  } as unknown as MetaGraphClient;
  return { client, posts, gets };
}

describe("InstagramPublisher", () => {
  it("publishes a single image without polling", async () => {
    const { client, posts, gets } = fakeClient({
      postResponses: [{ id: "container-1" }, { id: "media-1" }]
    });
    const publisher = new InstagramPublisher({ client, dispatcher: passthroughDispatcher() });

    const result = await publisher.publish(account, {
      kind: "image",
      imageUrl: "https://cdn/a.jpg",
      caption: "hello"
    });

    expect(result).toEqual({ mediaId: "media-1" });
    expect(gets).toHaveLength(0); // images need no status poll
    expect(posts[0]).toEqual({
      path: "/ig-1/media",
      body: { caption: "hello", image_url: "https://cdn/a.jpg" }
    });
    expect(posts[1]).toEqual({
      path: "/ig-1/media_publish",
      body: { creation_id: "container-1" }
    });
  });

  it("polls until FINISHED for a reel", async () => {
    const sleep = vi.fn(async () => undefined);
    const { client, posts, gets } = fakeClient({
      postResponses: [{ id: "reel-c" }, { id: "reel-media" }],
      statusSequence: ["IN_PROGRESS", "IN_PROGRESS", "FINISHED"]
    });
    const publisher = new InstagramPublisher({
      client,
      dispatcher: passthroughDispatcher(),
      sleep,
      pollIntervalMs: 50
    });

    const result = await publisher.publish(account, {
      kind: "reel",
      videoUrl: "https://cdn/v.mp4",
      thumbOffset: 1000
    });

    expect(result).toEqual({ mediaId: "reel-media" });
    expect(posts[0].body).toMatchObject({
      media_type: "REELS",
      video_url: "https://cdn/v.mp4",
      thumb_offset: 1000
    });
    expect(gets.length).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("uses media_type=VIDEO for a video post", async () => {
    const { client, posts } = fakeClient({
      postResponses: [{ id: "c" }, { id: "m" }],
      statusSequence: ["FINISHED"]
    });
    const publisher = new InstagramPublisher({
      client,
      dispatcher: passthroughDispatcher(),
      sleep: async () => undefined
    });
    await publisher.publish(account, { kind: "video", videoUrl: "https://cdn/v.mp4" });
    expect(posts[0].body).toMatchObject({ media_type: "VIDEO", video_url: "https://cdn/v.mp4" });
  });

  it("creates child + parent containers for a carousel", async () => {
    const { client, posts } = fakeClient({
      postResponses: [{ id: "child-1" }, { id: "child-2" }, { id: "parent" }, { id: "media" }],
      statusSequence: ["FINISHED"]
    });
    const publisher = new InstagramPublisher({
      client,
      dispatcher: passthroughDispatcher(),
      sleep: async () => undefined
    });

    const result = await publisher.publish(account, {
      kind: "carousel",
      caption: "set",
      children: [{ imageUrl: "https://cdn/1.jpg" }, { videoUrl: "https://cdn/2.mp4" }]
    });

    expect(result).toEqual({ mediaId: "media" });
    expect(posts[0].body).toMatchObject({
      is_carousel_item: "true",
      image_url: "https://cdn/1.jpg"
    });
    expect(posts[1].body).toMatchObject({ is_carousel_item: "true", media_type: "VIDEO" });
    expect(posts[2].body).toMatchObject({
      media_type: "CAROUSEL",
      children: "child-1,child-2",
      caption: "set"
    });
  });

  it("rejects carousels with fewer than 2 children", async () => {
    const { client } = fakeClient({ postResponses: [] });
    const publisher = new InstagramPublisher({ client, dispatcher: passthroughDispatcher() });
    await expect(
      publisher.publish(account, {
        kind: "carousel",
        children: [{ imageUrl: "https://cdn/1.jpg" }]
      })
    ).rejects.toThrow(/between 2 and 10/);
  });

  it("rejects a carousel child with no media url", async () => {
    const { client } = fakeClient({ postResponses: [{ id: "x" }] });
    const publisher = new InstagramPublisher({ client, dispatcher: passthroughDispatcher() });
    await expect(
      publisher.publish(account, {
        kind: "carousel",
        children: [{}, { imageUrl: "https://cdn/2.jpg" }]
      })
    ).rejects.toThrow(/imageUrl or videoUrl/);
  });

  it("throws when a container reports ERROR", async () => {
    const { client } = fakeClient({
      postResponses: [{ id: "c" }, { id: "m" }],
      statusSequence: ["ERROR"]
    });
    const publisher = new InstagramPublisher({
      client,
      dispatcher: passthroughDispatcher(),
      sleep: async () => undefined
    });
    await expect(
      publisher.publish(account, { kind: "video", videoUrl: "https://cdn/v.mp4" })
    ).rejects.toBeInstanceOf(IgContainerNotReadyError);
  });

  it("throws when the container never finishes", async () => {
    const { client } = fakeClient({
      postResponses: [{ id: "c" }, { id: "m" }],
      statusSequence: ["IN_PROGRESS", "IN_PROGRESS"]
    });
    const publisher = new InstagramPublisher({
      client,
      dispatcher: passthroughDispatcher(),
      sleep: async () => undefined,
      maxPollAttempts: 2
    });
    await expect(
      publisher.publish(account, { kind: "video", videoUrl: "https://cdn/v.mp4" })
    ).rejects.toThrow(/not ready after 2 polls/);
  });

  it("propagates a dispatcher failure as a thrown error", async () => {
    const failing = {
      dispatch: vi.fn(async () => ({
        ok: false,
        attempts: 1,
        error: new Error("denied"),
        dlqId: 7
      }))
    } as unknown as MetaDispatcher;
    const { client } = fakeClient({ postResponses: [{ id: "c" }] });
    const publisher = new InstagramPublisher({ client, dispatcher: failing });
    await expect(
      publisher.publish(account, { kind: "image", imageUrl: "https://cdn/a.jpg" })
    ).rejects.toThrow("denied");
  });
});
