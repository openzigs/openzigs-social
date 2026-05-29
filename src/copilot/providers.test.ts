import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AnthropicProvider,
  OpenAICompatibleProvider,
  createProvider,
  type ChatChunk
} from "./providers/index.js";

function sseChunks(chunks: string[]): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    }
  });
  return new Response(stream, { status: 200 });
}

async function collect(stream: AsyncIterable<ChatChunk>): Promise<ChatChunk[]> {
  const out: ChatChunk[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

describe("OpenAICompatibleProvider", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("streams deltas and reports usage on [DONE]", async () => {
    globalThis.fetch = vi.fn(async () =>
      sseChunks([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
        'data: {"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n',
        "data: [DONE]\n"
      ])
    ) as typeof fetch;

    const p = new OpenAICompatibleProvider({
      kind: "openai",
      name: "openai",
      apiKey: "k",
      model: "gpt-4"
    });
    const chunks = await collect(p.chat({ messages: [{ role: "user", content: "Hi" }] }));
    const deltas = chunks
      .filter((c) => c.delta)
      .map((c) => c.delta)
      .join("");
    expect(deltas).toBe("Hello");
    const done = chunks.find((c) => c.done);
    expect(done?.usage?.totalTokens).toBe(5);
  });

  it("rejects bad kind", () => {
    expect(
      () =>
        new OpenAICompatibleProvider({
          kind: "anthropic" as never,
          name: "x",
          model: "m"
        })
    ).toThrow(/bad kind/);
  });

  it("throws when model is missing", async () => {
    globalThis.fetch = vi.fn(async () => sseChunks(["data: [DONE]\n"])) as typeof fetch;
    const p = new OpenAICompatibleProvider({ kind: "openai", name: "o", apiKey: "k" });
    await expect(collect(p.chat({ messages: [{ role: "user", content: "hi" }] }))).rejects.toThrow(
      /model is required/
    );
  });

  it("throws on non-2xx", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as typeof fetch;
    const p = new OpenAICompatibleProvider({
      kind: "openai",
      name: "o",
      apiKey: "k",
      model: "m"
    });
    await expect(collect(p.chat({ messages: [{ role: "user", content: "hi" }] }))).rejects.toThrow(
      /HTTP 500/
    );
  });

  it("ignores malformed SSE lines", async () => {
    globalThis.fetch = vi.fn(async () =>
      sseChunks([
        "event: ping\n",
        "data: not-json\n",
        'data: {"choices":[{"delta":{"content":"x"}}]}\n',
        "data: [DONE]\n"
      ])
    ) as typeof fetch;
    const p = new OpenAICompatibleProvider({
      kind: "openai",
      name: "o",
      apiKey: "k",
      model: "m"
    });
    const out = await collect(p.chat({ messages: [{ role: "user", content: "hi" }] }));
    expect(out.find((c) => c.delta === "x")).toBeTruthy();
  });
});

describe("AnthropicProvider", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("streams deltas and emits final usage on message_stop", async () => {
    globalThis.fetch = vi.fn(async () =>
      sseChunks([
        'data: {"type":"message_start","message":{"usage":{"input_tokens":4,"output_tokens":0}}}\n',
        'data: {"type":"content_block_delta","delta":{"text":"Hello"}}\n',
        'data: {"type":"message_delta","usage":{"output_tokens":2}}\n',
        'data: {"type":"message_stop"}\n'
      ])
    ) as typeof fetch;

    const p = new AnthropicProvider({
      kind: "anthropic",
      name: "anthropic",
      apiKey: "ant-1",
      model: "claude-3"
    });
    const chunks = await collect(
      p.chat({
        messages: [
          { role: "system", content: "be brief" },
          { role: "user", content: "hi" }
        ]
      })
    );
    expect(chunks.find((c) => c.delta === "Hello")).toBeTruthy();
    const done = chunks.find((c) => c.done);
    expect(done?.usage).toEqual({ promptTokens: 4, completionTokens: 2, totalTokens: 6 });
  });

  it("throws without api key", () => {
    expect(
      () =>
        new AnthropicProvider({
          kind: "anthropic",
          name: "a",
          model: "m"
        })
    ).toThrow(/apiKey/);
  });

  it("throws on bad kind", () => {
    expect(
      () =>
        new AnthropicProvider({
          kind: "openai" as never,
          name: "a",
          apiKey: "k",
          model: "m"
        })
    ).toThrow(/bad kind/);
  });

  it("throws on missing model", async () => {
    globalThis.fetch = vi.fn(async () => sseChunks([])) as typeof fetch;
    const p = new AnthropicProvider({ kind: "anthropic", name: "a", apiKey: "k" });
    await expect(collect(p.chat({ messages: [{ role: "user", content: "hi" }] }))).rejects.toThrow(
      /model is required/
    );
  });

  it("throws on non-2xx", async () => {
    globalThis.fetch = vi.fn(async () => new Response("err", { status: 400 })) as typeof fetch;
    const p = new AnthropicProvider({
      kind: "anthropic",
      name: "a",
      apiKey: "k",
      model: "m"
    });
    await expect(collect(p.chat({ messages: [{ role: "user", content: "hi" }] }))).rejects.toThrow(
      /HTTP 400/
    );
  });
});

describe("createProvider factory", () => {
  it("creates each kind", () => {
    expect(createProvider({ kind: "openai", name: "o", apiKey: "k", model: "m" })).toBeInstanceOf(
      OpenAICompatibleProvider
    );
    expect(createProvider({ kind: "openai-compatible", name: "x", model: "m" })).toBeInstanceOf(
      OpenAICompatibleProvider
    );
    expect(
      createProvider({ kind: "anthropic", name: "a", apiKey: "k", model: "m" })
    ).toBeInstanceOf(AnthropicProvider);
  });

  it("rejects unknown kind", () => {
    expect(() => createProvider({ kind: "telepathy" as never, name: "x" })).toThrow(/unknown kind/);
  });
});
