import { describe, expect, it } from "vitest";

import { CopilotWrapper } from "./wrapper.js";
import type { Provider } from "./providers/index.js";

function p(name: string): Provider {
  return {
    config: { kind: "openai-compatible", name, isLocal: name === "local" },
    chat: async function* () {
      yield { delta: "", done: true };
    }
  };
}

describe("CopilotWrapper privacy enforcement", () => {
  it("throws when constructed with global privacy + cloud provider instance", () => {
    expect(
      () =>
        new CopilotWrapper({
          local: p("local"),
          cloud: p("cloud"),
          privacy: "global"
        })
    ).toThrow(/global privacy/);
  });
});
