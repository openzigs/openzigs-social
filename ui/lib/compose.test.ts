import { describe, expect, it } from "vitest";

import { charactersRemaining, DEFAULT_POST_LIMITS, postLimitsFor, validatePost } from "./compose";

describe("postLimitsFor", () => {
  it("resolves known platforms case-insensitively", () => {
    expect(postLimitsFor("Twitter").charLimit).toBe(280);
    expect(postLimitsFor("LINKEDIN").charLimit).toBe(3000);
  });

  it("falls back to the conservative default for unknown platforms", () => {
    expect(postLimitsFor("myspace")).toEqual(DEFAULT_POST_LIMITS);
  });
});

describe("validatePost", () => {
  it("rejects an entirely empty post", () => {
    expect(validatePost("twitter", "   ", [])).toEqual({
      ok: false,
      reason: "post is empty"
    });
  });

  it("blocks an over-280-char X post", () => {
    const result = validatePost("twitter", "x".repeat(281), []);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("280 character limit");
  });

  it("accepts a 280-char X post", () => {
    expect(validatePost("twitter", "x".repeat(280), [])).toEqual({ ok: true });
  });

  it("rejects too many attachments", () => {
    const media = Array.from({ length: 5 }, () => ({ url: "u", type: "image/png" }));
    const result = validatePost("twitter", "hi", media);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("at most 4");
  });

  it("rejects an unsupported media type", () => {
    const result = validatePost("twitter", "hi", [{ url: "u", type: "application/pdf" }]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("does not accept media");
  });

  it("rejects oversized media", () => {
    const result = validatePost("twitter", "hi", [
      { url: "u", type: "image/png", bytes: 6 * 1024 * 1024 }
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("byte limit");
  });

  it("accepts a valid post with media", () => {
    expect(
      validatePost("twitter", "hello", [{ url: "u", type: "image/png", bytes: 1024 }])
    ).toEqual({ ok: true });
  });
});

describe("charactersRemaining", () => {
  it("returns remaining characters and goes negative over the limit", () => {
    expect(charactersRemaining("twitter", "hello")).toBe(275);
    expect(charactersRemaining("twitter", "x".repeat(300))).toBe(-20);
  });
});
