import { describe, expect, it } from "vitest";

import { CopilotWrapper } from "./wrapper.js";
import type { ChatChunk, ChatOptions, Provider } from "./providers/index.js";

function noopProvider(name: string): Provider {
  return {
    config: { kind: "openai-compatible", name, isLocal: true },
    chat: async function* (_opts: ChatOptions): AsyncIterable<ChatChunk> {
      yield { delta: "ok", done: true };
    }
  };
}

describe("CopilotWrapper", () => {
  it("wires local + cloud + router + session manager", async () => {
    const local = noopProvider("local");
    const cloud: Provider = {
      config: { kind: "openai", name: "openai" },
      chat: async function* () {
        yield { delta: "cloud", done: true };
      }
    };
    const w = new CopilotWrapper({ local, cloud, router: { cloudThresholdTokens: 0 } });
    const s = w.sessions.create();
    const r = await w.sessions.send(s.id, { prompt: "hello world that is long enough" });
    expect(r.decision).toBe("cloud");
    expect(r.provider).toBe("openai");
  });

  it("setPrivacyMode forces local routing", async () => {
    const local = noopProvider("local");
    const cloud: Provider = {
      config: { kind: "openai", name: "openai" },
      chat: async function* () {
        yield { delta: "cloud", done: true };
      }
    };
    const w = new CopilotWrapper({ local, cloud, router: { cloudThresholdTokens: 0 } });
    w.setPrivacyMode("session");
    const s = w.sessions.create();
    const r = await w.sessions.send(s.id, { prompt: "x".repeat(1000) });
    expect(r.decision).toBe("local");
  });

  it("constructs cloud provider from a ProviderConfig", () => {
    const w = new CopilotWrapper({
      local: noopProvider("local"),
      cloud: { kind: "openai", name: "openai", apiKey: "k", model: "gpt-4" }
    });
    expect(w.cloud?.config.name).toBe("openai");
  });
});
