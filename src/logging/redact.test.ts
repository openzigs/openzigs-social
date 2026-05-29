import { describe, expect, it } from "vitest";

import { isSensitiveKey, REDACTED, redact } from "./redact.js";

describe("redact", () => {
  it("redacts sensitive keys", () => {
    const out = redact({
      apiKey: "sk-123",
      accessToken: "at-456",
      refreshToken: "rt-789",
      password: "hunter2",
      secret: "shh",
      authorization: "Bearer x",
      keep: "visible"
    });
    expect(out.apiKey).toBe(REDACTED);
    expect(out.accessToken).toBe(REDACTED);
    expect(out.refreshToken).toBe(REDACTED);
    expect(out.password).toBe(REDACTED);
    expect(out.secret).toBe(REDACTED);
    expect(out.authorization).toBe(REDACTED);
    expect(out.keep).toBe("visible");
  });

  it("redacts nested and array values", () => {
    const out = redact({
      provider: { config: { apiKey: "sk-1" } },
      list: [{ token: "t1" }, { ok: 1 }]
    });
    expect(out.provider.config.apiKey).toBe(REDACTED);
    expect(out.list[0].token).toBe(REDACTED);
    expect(out.list[1].ok).toBe(1);
  });

  it("does not mutate the input", () => {
    const input = { apiKey: "sk-1" };
    redact(input);
    expect(input.apiKey).toBe("sk-1");
  });

  it("handles circular references", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    const out = redact(a) as Record<string, unknown>;
    expect(out.self).toBe("[Circular]");
  });

  it("passes primitives through", () => {
    expect(redact(42)).toBe(42);
    expect(redact("plain")).toBe("plain");
    expect(redact(null)).toBe(null);
  });

  it("classifies keys", () => {
    expect(isSensitiveKey("client_secret")).toBe(true);
    expect(isSensitiveKey("username")).toBe(false);
  });
});
