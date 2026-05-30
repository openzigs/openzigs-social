/**
 * Tests for per-platform post limits + validation (#87).
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_POST_LIMITS, POST_LIMITS, postLimitsFor, validatePost } from "./post-limits.js";

describe("postLimitsFor", () => {
  it("resolves known platforms case-insensitively", () => {
    expect(postLimitsFor("twitter").charLimit).toBe(280);
    expect(postLimitsFor("TWITTER").charLimit).toBe(280);
    expect(postLimitsFor("linkedin").charLimit).toBe(3000);
  });

  it("falls back to conservative defaults for unknown platforms", () => {
    expect(postLimitsFor("myspace")).toEqual(DEFAULT_POST_LIMITS);
  });

  it("enforces the X 280-char / 4-media cap", () => {
    expect(POST_LIMITS.twitter?.charLimit).toBe(280);
    expect(POST_LIMITS.twitter?.maxMedia).toBe(4);
  });
});

describe("validatePost", () => {
  it("rejects an empty post", () => {
    expect(validatePost("twitter", "   ")).toEqual({ ok: false, reason: "post is empty" });
  });

  it("accepts a media-only post", () => {
    expect(validatePost("twitter", "", [{ url: "u", type: "image/png" }]).ok).toBe(true);
  });

  it("blocks a body over the platform char limit", () => {
    const over = "a".repeat(281);
    const result = validatePost("twitter", over);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("280");
  });

  it("accepts a body at exactly the char limit", () => {
    expect(validatePost("twitter", "a".repeat(280)).ok).toBe(true);
  });

  it("rejects too many media attachments", () => {
    const media = Array.from({ length: 5 }, () => ({ url: "u", type: "image/png" }));
    const result = validatePost("twitter", "hi", media);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("at most 4");
  });

  it("rejects an unsupported media type", () => {
    const result = validatePost("twitter", "hi", [{ url: "u", type: "application/pdf" }]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("does not accept");
  });

  it("rejects media over the byte limit", () => {
    const result = validatePost("twitter", "hi", [
      { url: "u", type: "image/png", bytes: 6 * 1024 * 1024 }
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("byte limit");
  });

  it("accepts a valid post with media", () => {
    expect(
      validatePost("twitter", "hi", [{ url: "u", type: "image/png", altText: "a", bytes: 1024 }]).ok
    ).toBe(true);
  });
});
