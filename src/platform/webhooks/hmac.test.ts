import { describe, expect, it } from "vitest";

import { computeSignature, normalizeSignature, verifySignature } from "./hmac.js";

describe("webhook hmac", () => {
  const secret = "shhh-secret";
  const body = Buffer.from(JSON.stringify({ hello: "world" }));

  it("computes a stable hex digest", () => {
    const sig = computeSignature(body, secret);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(computeSignature(body, secret)).toBe(sig);
  });

  it("normalizes algo-prefixed signatures", () => {
    expect(normalizeSignature("sha256=ABCDEF")).toBe("abcdef");
    expect(normalizeSignature("abcdef")).toBe("abcdef");
  });

  it("verifies a correct signature with and without prefix", () => {
    const sig = computeSignature(body, secret);
    expect(verifySignature(body, sig, secret)).toBe(true);
    expect(verifySignature(body, `sha256=${sig}`, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = computeSignature(body, secret);
    expect(verifySignature(Buffer.from("tampered"), sig, secret)).toBe(false);
  });

  it("rejects wrong secret, missing/empty/malformed signatures", () => {
    const sig = computeSignature(body, secret);
    expect(verifySignature(body, sig, "wrong")).toBe(false);
    expect(verifySignature(body, undefined, secret)).toBe(false);
    expect(verifySignature(body, "", secret)).toBe(false);
    expect(verifySignature(body, "sha256=not-hex!", secret)).toBe(false);
    expect(verifySignature(body, sig, "")).toBe(false);
  });

  it("rejects a signature of the wrong length", () => {
    expect(verifySignature(body, "abcd", secret)).toBe(false);
  });
});
