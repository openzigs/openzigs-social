import { describe, expect, it } from "vitest";

import { isSensitiveKey, REDACTED, redact, scrubSecretsInString } from "./redact.js";

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

describe("scrubSecretsInString", () => {
  it("masks a Bearer token", () => {
    expect(scrubSecretsInString("Authorization: Bearer abc.DEF-123_xyz")).toBe(
      "Authorization: Bearer [REDACTED]"
    );
  });

  it("masks an sk- style key", () => {
    const fakeKey = "sk-EXAMPLEEXAMPLEEXAMPLE"; // gitleaks:allow — synthetic test fixture
    expect(scrubSecretsInString(`key=${fakeKey} end`)).toBe("key=sk-[REDACTED] end");
  });

  it("leaves a normal string untouched", () => {
    const msg = "user logged in from 10.0.0.1";
    expect(scrubSecretsInString(msg)).toBe(msg);
  });

  it("does not mask short sk- prefixes", () => {
    expect(scrubSecretsInString("sk-tiny")).toBe("sk-tiny");
  });
});

describe("redact value-level scrubbing", () => {
  it("masks a Bearer token embedded in a message string", () => {
    const out = redact({ message: "calling api with Bearer tok.en-VALUE_123" });
    expect(out.message).toBe("calling api with Bearer [REDACTED]");
  });

  it("masks an sk- key in a nested string value", () => {
    const fakeKey = "sk-EXAMPLEEXAMPLEEXAMPLE"; // gitleaks:allow — synthetic test fixture
    const out = redact({ outer: { note: `using ${fakeKey} now` } });
    expect(out.outer.note).toBe("using sk-[REDACTED] now");
  });

  it("leaves a normal message untouched", () => {
    const out = redact({ message: "session restored for client-a" });
    expect(out.message).toBe("session restored for client-a");
  });
});
