/**
 * Tests for the connector → outbox publisher adapters (#86).
 */
import { describe, expect, it, vi } from "vitest";
import type { TwitterPublisher } from "../../connectors/twitter/publisher.js";
import type { LinkedInPublisher } from "../../connectors/linkedin/publisher.js";
import { NoPublisherError } from "../../outbox/dispatch.js";
import { buildOutboxDispatch } from "./publishers.js";

function vaultWith(tokens: Record<string, string>) {
  return {
    getOAuth: vi.fn(async (platform: string) =>
      tokens[platform] ? { accessToken: tokens[platform] } : undefined
    )
  } as unknown as Parameters<typeof buildOutboxDispatch>[0]["vault"];
}

describe("buildOutboxDispatch", () => {
  it("registers no publishers when none are provided", () => {
    const dispatch = buildOutboxDispatch({ vault: vaultWith({}) });
    expect(dispatch.platforms()).toEqual([]);
  });

  it("publishes an X post with the vault token and returns the tweet id", async () => {
    const publish = vi.fn().mockResolvedValue({ tweetId: "t-42" });
    const twitter = { publish } as unknown as TwitterPublisher;
    const dispatch = buildOutboxDispatch({ vault: vaultWith({ twitter: "tok" }), twitter });

    const result = await dispatch.publish({ platform: "twitter", body: "hi", media: [] });

    expect(publish).toHaveBeenCalledWith("tok", { text: "hi" });
    expect(result.externalId).toBe("t-42");
  });

  it("throws when the X token is missing", async () => {
    const twitter = { publish: vi.fn() } as unknown as TwitterPublisher;
    const dispatch = buildOutboxDispatch({ vault: vaultWith({}), twitter });
    await expect(dispatch.publish({ platform: "twitter", body: "x", media: [] })).rejects.toThrow(
      /no X .* access token/
    );
  });

  it("publishes a LinkedIn post, parsing the author accountId", async () => {
    const publish = vi.fn().mockResolvedValue({ postId: "p-1" });
    const linkedin = { publish } as unknown as LinkedInPublisher;
    const dispatch = buildOutboxDispatch({ vault: vaultWith({ linkedin: "tok" }), linkedin });

    await dispatch.publish({
      platform: "linkedin",
      accountId: "organization:99",
      body: "post",
      media: []
    });

    expect(publish).toHaveBeenCalledWith(
      { kind: "organization", id: "99", accessToken: "tok" },
      { commentary: "post" }
    );
  });

  it("defaults a bare LinkedIn accountId to a member author", async () => {
    const publish = vi.fn().mockResolvedValue({ postId: "p-2" });
    const linkedin = { publish } as unknown as LinkedInPublisher;
    const dispatch = buildOutboxDispatch({ vault: vaultWith({ linkedin: "tok" }), linkedin });

    await dispatch.publish({ platform: "linkedin", accountId: "abc", body: "x", media: [] });

    expect(publish).toHaveBeenCalledWith(
      { kind: "member", id: "abc", accessToken: "tok" },
      { commentary: "x" }
    );
  });

  it("throws when a LinkedIn author accountId is missing", async () => {
    const linkedin = { publish: vi.fn() } as unknown as LinkedInPublisher;
    const dispatch = buildOutboxDispatch({ vault: vaultWith({ linkedin: "tok" }), linkedin });
    await expect(dispatch.publish({ platform: "linkedin", body: "x", media: [] })).rejects.toThrow(
      /author accountId/
    );
  });

  it("dead-letters an unregistered platform via NoPublisherError", async () => {
    const dispatch = buildOutboxDispatch({ vault: vaultWith({}) });
    await expect(dispatch.publish({ platform: "tiktok", body: "x", media: [] })).rejects.toThrow(
      NoPublisherError
    );
  });
});
