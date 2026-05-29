import { describe, expect, it } from "vitest";

import { PrivacyController } from "./privacy.js";
import type { ChatChunk, ChatOptions, Provider } from "./providers/index.js";
import { DEFAULT_CLOUD_THRESHOLD_TOKENS, estimateTokens, SmartRouter } from "./smart-router.js";

function fakeProvider(name: string): Provider {
  return {
    config: { kind: "openai-compatible", name },
    chat: async function* (_opts: ChatOptions): AsyncIterable<ChatChunk> {
      yield { delta: "", done: true };
    }
  };
}

describe("smart router", () => {
  const local = fakeProvider("local");
  const cloud = fakeProvider("cloud");

  it("estimateTokens uses chars/4", () => {
    expect(estimateTokens([{ role: "user", content: "1234" }])).toBe(1);
    expect(estimateTokens([{ role: "user", content: "abcdefgh" }])).toBe(2);
  });

  it("returns local under threshold", () => {
    const r = new SmartRouter({ local, cloud });
    const result = r.route([{ role: "user", content: "x" }]);
    expect(result.provider).toBe(local);
    expect(result.decision).toBe("local");
    expect(result.reason).toBe("threshold");
  });

  it("returns cloud when estimate exceeds threshold", () => {
    const r = new SmartRouter({ local, cloud }, { cloudThresholdTokens: 1 });
    const result = r.route([{ role: "user", content: "abcdefgh" }]); // 2 tokens
    expect(result.provider).toBe(cloud);
    expect(result.decision).toBe("cloud");
    expect(result.reason).toBe("default-cloud");
  });

  it("returns local when no cloud configured", () => {
    const r = new SmartRouter({ local }, { cloudThresholdTokens: 0 });
    const result = r.route([{ role: "user", content: "x".repeat(1000) }]);
    expect(result.provider).toBe(local);
    expect(result.reason).toBe("no-cloud");
  });

  it("forces local under privacy session/global", () => {
    for (const mode of ["session", "global"] as const) {
      const privacy = new PrivacyController(mode);
      const r = new SmartRouter({ local, cloud, privacy }, { cloudThresholdTokens: 0 });
      const result = r.route([{ role: "user", content: "x".repeat(1000) }]);
      expect(result.provider).toBe(local);
      expect(result.reason).toBe("privacy");
    }
  });

  it("uses static privacyMode option when no controller", () => {
    const r = new SmartRouter(
      { local, cloud },
      { cloudThresholdTokens: 0, privacyMode: "session" }
    );
    const result = r.route([{ role: "user", content: "x" }]);
    expect(result.reason).toBe("privacy");
  });

  it("exposes the threshold", () => {
    const r = new SmartRouter({ local });
    expect(r.cloudThresholdTokens).toBe(DEFAULT_CLOUD_THRESHOLD_TOKENS);
  });
});
