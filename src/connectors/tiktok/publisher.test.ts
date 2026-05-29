import { describe, expect, it, vi } from "vitest";

import type { TikTokDispatcher } from "./dispatcher.js";
import type { TikTokRestClient } from "./rest-client.js";
import {
  assertPrivateOnly,
  TikTokPrivacyError,
  TikTokPublisher,
  TIKTOK_FORBIDDEN_PRIVACY_LEVELS,
  TIKTOK_PRIVATE_PRIVACY_LEVEL
} from "./publisher.js";

/** Dispatcher stub that just runs the op and reports success. */
function passthroughDispatcher(): {
  dispatcher: TikTokDispatcher;
  dispatch: ReturnType<typeof vi.fn>;
} {
  const dispatch = vi.fn(async (_op: unknown, run: () => Promise<unknown>) => ({
    ok: true,
    value: await run(),
    attempts: 1
  }));
  return { dispatcher: { dispatch } as unknown as TikTokDispatcher, dispatch };
}

function clientReturning(body: unknown): {
  client: TikTokRestClient;
  post: ReturnType<typeof vi.fn>;
} {
  const post = vi.fn(async () => body);
  return { client: { post } as unknown as TikTokRestClient, post };
}

describe("assertPrivateOnly", () => {
  it("allows undefined (defaults applied later)", () => {
    expect(() => assertPrivateOnly(undefined)).not.toThrow();
  });

  it("allows the exact SELF_ONLY level", () => {
    expect(() => assertPrivateOnly(TIKTOK_PRIVATE_PRIVACY_LEVEL)).not.toThrow();
  });

  it.each(TIKTOK_FORBIDDEN_PRIVACY_LEVELS)("rejects forbidden level %s", (level) => {
    expect(() => assertPrivateOnly(level)).toThrow(TikTokPrivacyError);
  });

  it("rejects any other arbitrary value (fail closed)", () => {
    expect(() => assertPrivateOnly("self_only")).toThrow(TikTokPrivacyError);
    expect(() => assertPrivateOnly("")).toThrow(TikTokPrivacyError);
  });
});

describe("TikTokPublisher.publishVideo", () => {
  it("forces privacy_level=SELF_ONLY and PULL_FROM_URL", async () => {
    const { dispatcher } = passthroughDispatcher();
    const { client, post } = clientReturning({ publish_id: "pub1" });
    const publisher = new TikTokPublisher({ client, dispatcher });

    const result = await publisher.publishVideo("tok", {
      videoUrl: "https://cdn.example/v.mp4",
      title: "hi"
    });

    expect(result).toEqual({ publishId: "pub1" });
    const [, opts] = post.mock.calls[0]!;
    const body = (
      opts as {
        body: {
          post_info: { privacy_level: string };
          source_info: { source: string; video_url: string };
        };
      }
    ).body;
    expect(body.post_info.privacy_level).toBe("SELF_ONLY");
    expect(body.source_info.source).toBe("PULL_FROM_URL");
    expect(body.source_info.video_url).toBe("https://cdn.example/v.mp4");
  });

  it("ignores a caller-supplied SELF_ONLY and still posts privately", async () => {
    const { dispatcher } = passthroughDispatcher();
    const { client, post } = clientReturning({ publish_id: "p" });
    const publisher = new TikTokPublisher({ client, dispatcher });

    await publisher.publishVideo("tok", {
      videoUrl: "https://cdn.example/v.mp4",
      privacyLevel: "SELF_ONLY"
    });

    const body = (post.mock.calls[0]![1] as { body: { post_info: { privacy_level: string } } })
      .body;
    expect(body.post_info.privacy_level).toBe("SELF_ONLY");
  });

  it.each(TIKTOK_FORBIDDEN_PRIVACY_LEVELS)(
    "refuses to publish when caller requests %s and never calls the API",
    async (level) => {
      const { dispatcher, dispatch } = passthroughDispatcher();
      const { client, post } = clientReturning({ publish_id: "p" });
      const publisher = new TikTokPublisher({ client, dispatcher });

      await expect(
        publisher.publishVideo("tok", {
          videoUrl: "https://cdn.example/v.mp4",
          privacyLevel: level
        })
      ).rejects.toBeInstanceOf(TikTokPrivacyError);

      expect(dispatch).not.toHaveBeenCalled();
      expect(post).not.toHaveBeenCalled();
    }
  );

  it("throws when the API returns no publish_id", async () => {
    const { dispatcher } = passthroughDispatcher();
    const { client } = clientReturning({});
    const publisher = new TikTokPublisher({ client, dispatcher });

    await expect(
      publisher.publishVideo("tok", { videoUrl: "https://cdn.example/v.mp4" })
    ).rejects.toThrow(/publish_id/);
  });

  it("propagates a dispatcher failure", async () => {
    const dispatch = vi.fn(async () => ({
      ok: false,
      attempts: 3,
      error: new Error("dlq"),
      dlqId: 7
    }));
    const dispatcher = { dispatch } as unknown as TikTokDispatcher;
    const { client } = clientReturning({ publish_id: "p" });
    const publisher = new TikTokPublisher({ client, dispatcher });

    await expect(
      publisher.publishVideo("tok", { videoUrl: "https://cdn.example/v.mp4" })
    ).rejects.toThrow("dlq");
  });
});
