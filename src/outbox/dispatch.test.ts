/**
 * Tests for the outbox publisher dispatch registry (#84).
 */
import { describe, expect, it, vi } from "vitest";
import { NoPublisherError, OutboxDispatch, type OutboxPublisher } from "./dispatch.js";

function fakePublisher(externalId?: string): OutboxPublisher {
  return { publish: vi.fn().mockResolvedValue({ externalId }) };
}

describe("OutboxDispatch", () => {
  it("registers and resolves publishers case-insensitively", () => {
    const dispatch = new OutboxDispatch();
    const pub = fakePublisher();
    dispatch.register("Twitter", pub);
    expect(dispatch.has("twitter")).toBe(true);
    expect(dispatch.has("TWITTER")).toBe(true);
    expect(dispatch.get("twitter")).toBe(pub);
    expect(dispatch.platforms()).toEqual(["twitter"]);
  });

  it("publishes through the registered adapter", async () => {
    const dispatch = new OutboxDispatch();
    dispatch.register("twitter", fakePublisher("tweet-1"));
    const result = await dispatch.publish({ platform: "twitter", body: "hi", media: [] });
    expect(result.externalId).toBe("tweet-1");
  });

  it("throws NoPublisherError for an unregistered platform", async () => {
    const dispatch = new OutboxDispatch();
    await expect(dispatch.publish({ platform: "tiktok", body: "x", media: [] })).rejects.toThrow(
      NoPublisherError
    );
  });

  it("replaces an existing publisher on re-register", () => {
    const dispatch = new OutboxDispatch();
    const first = fakePublisher();
    const second = fakePublisher();
    dispatch.register("twitter", first).register("twitter", second);
    expect(dispatch.get("twitter")).toBe(second);
  });
});
