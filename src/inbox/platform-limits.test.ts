import { describe, expect, it } from "vitest";

import { DEFAULT_LIMITS, isDmSupported, limitsFor, validateReply } from "./platform-limits.js";

describe("platform limits", () => {
  it("resolves known platforms case-insensitively", () => {
    expect(limitsFor("Instagram").label).toBe("Instagram");
    expect(limitsFor("TWITTER").dmCharLimit).toBe(10_000);
  });

  it("treats LinkedIn as comments-only", () => {
    expect(isDmSupported("linkedin")).toBe(false);
    expect(limitsFor("linkedin").commentCharLimit).toBe(1250);
  });

  it("falls back to conservative defaults for unknown platforms", () => {
    expect(limitsFor("myspace")).toEqual(DEFAULT_LIMITS);
    expect(isDmSupported("myspace")).toBe(false);
  });
});

describe("validateReply", () => {
  it("rejects empty bodies", () => {
    expect(validateReply("instagram", "dm", "   ").ok).toBe(false);
  });

  it("rejects DMs on comments-only platforms", () => {
    const r = validateReply("linkedin", "dm", "hello");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/does not support DMs/);
  });

  it("enforces the per-platform character limit", () => {
    const r = validateReply("twitter", "comment", "x".repeat(281));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/280 character/);
  });

  it("enforces the media attachment limit", () => {
    expect(validateReply("linkedin", "comment", "hi", 1).ok).toBe(false);
    expect(validateReply("twitter", "dm", "hi", 4).ok).toBe(true);
  });

  it("accepts a valid reply", () => {
    expect(validateReply("instagram", "dm", "hello there").ok).toBe(true);
  });
});
