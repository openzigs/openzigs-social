import { describe, expect, it, vi } from "vitest";

import {
  createOllamaProvider,
  OLLAMA_DEFAULT_BASE_URL,
  pickGemma4Variant,
  pickInstalledGemma4,
  probeOllama
} from "./providers/ollama.js";

const GiB = 1024 * 1024 * 1024;

describe("pickGemma4Variant", () => {
  it("returns e2b on small hosts", () => {
    expect(pickGemma4Variant(4 * GiB)).toBe("gemma4:e2b");
  });
  it("returns e4b on 8–16 GiB hosts", () => {
    expect(pickGemma4Variant(8 * GiB)).toBe("gemma4:e4b");
    expect(pickGemma4Variant(15 * GiB)).toBe("gemma4:e4b");
  });
  it("returns e8b on large hosts", () => {
    expect(pickGemma4Variant(16 * GiB)).toBe("gemma4:e8b");
    expect(pickGemma4Variant(64 * GiB)).toBe("gemma4:e8b");
  });
});

describe("pickInstalledGemma4", () => {
  it("prefers e8b > e4b > e2b", () => {
    expect(pickInstalledGemma4({ models: [{ name: "gemma4:e2b" }, { name: "gemma4:e8b" }] })).toBe(
      "gemma4:e8b"
    );
    expect(pickInstalledGemma4({ models: [{ name: "gemma4:e4b" }] })).toBe("gemma4:e4b");
  });
  it("returns undefined when no variant installed", () => {
    expect(pickInstalledGemma4({ models: [{ name: "llama3" }] })).toBeUndefined();
    expect(pickInstalledGemma4(undefined)).toBeUndefined();
    expect(pickInstalledGemma4({})).toBeUndefined();
  });
});

describe("probeOllama", () => {
  it("reports reachable + installed variant on success", async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ models: [{ name: "gemma4:e4b" }] }), { status: 200 })
    );
    const r = await probeOllama(OLLAMA_DEFAULT_BASE_URL, fakeFetch as typeof fetch);
    expect(r.reachable).toBe(true);
    expect(r.installedVariant).toBe("gemma4:e4b");
  });

  it("reports unreachable on non-200", async () => {
    const fakeFetch = vi.fn(async () => new Response("", { status: 500 }));
    const r = await probeOllama(OLLAMA_DEFAULT_BASE_URL, fakeFetch as typeof fetch);
    expect(r.reachable).toBe(false);
  });

  it("reports unreachable on network error", async () => {
    const fakeFetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const r = await probeOllama(OLLAMA_DEFAULT_BASE_URL, fakeFetch as typeof fetch);
    expect(r.reachable).toBe(false);
  });
});

describe("createOllamaProvider", () => {
  it("builds an openai-compatible provider with a Gemma 4 default", () => {
    const p = createOllamaProvider();
    expect(p.config.kind).toBe("openai-compatible");
    expect(p.config.isLocal).toBe(true);
    expect(p.config.model).toMatch(/^gemma4:/);
    expect(p.config.baseUrl).toBe(OLLAMA_DEFAULT_BASE_URL);
  });

  it("respects explicit model + baseUrl overrides", () => {
    const p = createOllamaProvider({ model: "gemma4:e8b", baseUrl: "http://x/v1" });
    expect(p.config.model).toBe("gemma4:e8b");
    expect(p.config.baseUrl).toBe("http://x/v1");
  });
});
