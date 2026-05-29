import { describe, expect, it, vi } from "vitest";

import { CopilotProvider } from "./providers/copilot.js";
import type { ChatChunk } from "./providers/index.js";

interface FakeEvent {
  type: string;
  data: { content: string };
}

function fakeClient(messages: string[]) {
  const handlers: Array<(e: FakeEvent) => void> = [];
  const session = {
    on: (h: (e: FakeEvent) => void) => handlers.push(h),
    sendAndWait: vi.fn(async () => {
      for (const m of messages) {
        for (const h of handlers) h({ type: "assistant.message", data: { content: m } });
      }
    }),
    disconnect: vi.fn(async () => undefined)
  };
  return {
    createSession: vi.fn(async () => session),
    session
  };
}

describe("CopilotProvider", () => {
  it("streams session.on assistant.message events as deltas", async () => {
    const client = fakeClient(["Hello", " world"]);
    const provider = new CopilotProvider(
      { kind: "copilot", name: "copilot" },
      { clientFactory: () => client as never }
    );
    const out: ChatChunk[] = [];
    for await (const chunk of provider.chat({
      messages: [
        { role: "system", content: "be helpful" },
        { role: "user", content: "hi" }
      ]
    })) {
      out.push(chunk);
    }
    expect(out.map((c) => c.delta).join("")).toBe("Hello world");
    expect(out.some((c) => c.done)).toBe(true);
    expect(client.session.disconnect).toHaveBeenCalled();
    expect(client.session.sendAndWait).toHaveBeenCalled();
  });

  it("rejects bad kind", () => {
    expect(
      () =>
        new CopilotProvider(
          { kind: "openai" as never, name: "x" },
          { clientFactory: () => fakeClient([]) as never }
        )
    ).toThrow(/bad kind/);
  });

  it("uses default model when none provided", async () => {
    const client = fakeClient([]);
    const provider = new CopilotProvider(
      { kind: "copilot", name: "copilot" },
      { clientFactory: () => client as never, defaultModel: "gpt-5" }
    );
    const it2 = provider.chat({ messages: [{ role: "user", content: "hi" }] });
    for await (const _ of it2) {
      void _;
    }
    expect(client.createSession).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-5" }));
  });

  it("composes prompt from system + role-prefixed turns", async () => {
    const client = fakeClient([]);
    const provider = new CopilotProvider(
      { kind: "copilot", name: "copilot" },
      { clientFactory: () => client as never }
    );
    const it2 = provider.chat({
      messages: [
        { role: "system", content: "S" },
        { role: "user", content: "U" },
        { role: "assistant", content: "A" }
      ]
    });
    for await (const _ of it2) {
      void _;
    }
    expect(client.session.sendAndWait).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "S\n\nuser: U\nassistant: A" })
    );
  });
});
