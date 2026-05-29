import { describe, expect, it, vi } from "vitest";

import { PrivacyController } from "./privacy.js";
import type { ChatChunk, ChatOptions, Provider } from "./providers/index.js";
import { SessionManager } from "./session-manager.js";
import { SmartRouter } from "./smart-router.js";

function provider(name: string, chunks: ChatChunk[]): Provider {
  return {
    config: { kind: "openai-compatible", name },
    chat: async function* (_opts: ChatOptions): AsyncIterable<ChatChunk> {
      for (const c of chunks) yield c;
    }
  };
}

describe("SessionManager", () => {
  it("creates a session and lists it", () => {
    const router = new SmartRouter({ local: provider("local", []) });
    const mgr = new SessionManager(router);
    const a = mgr.create();
    const b = mgr.create("system");
    expect(mgr.list().map((s) => s.id)).toEqual([a.id, b.id]);
    expect(mgr.get(a.id)).toBe(a);
    expect(b.messages[0]).toEqual({ role: "system", content: "system" });
    expect(mgr.delete(a.id)).toBe(true);
    expect(mgr.delete(a.id)).toBe(false);
  });

  it("streams deltas, emits session.tokens.update, returns final content", async () => {
    const local = provider("local", [
      { delta: "Hel" },
      { delta: "lo" },
      { delta: "", done: true, usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 } }
    ]);
    const router = new SmartRouter({ local });
    const mgr = new SessionManager(router);
    const updates = vi.fn();
    mgr.on("session.tokens.update", updates);
    const s = mgr.create();
    const result = await mgr.send(s.id, { prompt: "Hi" });
    expect(result.content).toBe("Hello");
    expect(result.provider).toBe("local");
    expect(result.decision).toBe("local");
    expect(updates).toHaveBeenCalledTimes(2);
    expect(result.tokens.completionTokens).toBe(2);
    expect(result.tokens.promptTokens).toBe(5);
  });

  it("uses an explicit provider override when supplied", async () => {
    const local = provider("local", [{ delta: "L", done: true }]);
    const override = provider("override", [{ delta: "O", done: true }]);
    const router = new SmartRouter({ local });
    const mgr = new SessionManager(router);
    const s = mgr.create();
    const r = await mgr.send(s.id, { prompt: "go", provider: override });
    expect(r.content).toBe("O");
    expect(r.provider).toBe("override");
  });

  it("throws when session is unknown", async () => {
    const router = new SmartRouter({ local: provider("l", []) });
    const mgr = new SessionManager(router);
    await expect(mgr.send("nope", { prompt: "x" })).rejects.toThrow(/not found/);
  });

  it("respects global privacy mode (blocks cloud route)", async () => {
    const local = provider("local", [{ delta: "", done: true }]);
    const cloud = provider("cloud", [{ delta: "", done: true }]);
    const privacy = new PrivacyController("global");
    const router = new SmartRouter({ local, cloud, privacy }, { cloudThresholdTokens: 0 });
    const mgr = new SessionManager(router, privacy);
    const s = mgr.create();
    // Even with a huge prompt, the router must route local under global.
    const r = await mgr.send(s.id, { prompt: "x".repeat(10000) });
    expect(r.decision).toBe("local");
    expect(r.provider).toBe("local");
  });

  it("accumulates tokens optimistically when usage is absent", async () => {
    const local = provider("local", [{ delta: "abcdefgh" }, { delta: "", done: true }]);
    const router = new SmartRouter({ local });
    const mgr = new SessionManager(router);
    const s = mgr.create();
    const r = await mgr.send(s.id, { prompt: "x" });
    expect(r.tokens.completionTokens).toBeGreaterThan(0);
  });
});
