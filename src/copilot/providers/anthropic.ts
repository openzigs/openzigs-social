/**
 * Anthropic Messages streaming provider.
 *
 * Implements the SSE `messages` API. Tool-calls intentionally not modelled
 * here — the wrapper does not yet need them.
 */
import type { ChatChunk, ChatOptions, Provider, ProviderConfig, TokenUsage } from "./types.js";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicEvent {
  type: string;
  delta?: { text?: string };
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class AnthropicProvider implements Provider {
  constructor(public readonly config: ProviderConfig) {
    if (config.kind !== "anthropic") {
      throw new Error(`AnthropicProvider: bad kind ${config.kind}`);
    }
    if (!config.apiKey) throw new Error("anthropic: apiKey is required");
  }

  async *chat(opts: ChatOptions): AsyncIterable<ChatChunk> {
    const base = (this.config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    const url = `${base}/v1/messages`;
    const model = opts.model ?? this.config.model;
    if (!model) throw new Error("anthropic: model is required");

    const system = opts.messages.find((m) => m.role === "system")?.content;
    const messages = opts.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const body = {
      model,
      stream: true,
      max_tokens: opts.maxTokens ?? 1024,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(system ? { system } : {}),
      messages
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.apiKey!,
        "anthropic-version": ANTHROPIC_VERSION,
        accept: "text/event-stream"
      },
      body: JSON.stringify(body),
      signal: opts.signal
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`anthropic: HTTP ${res.status} ${text.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let ev: AnthropicEvent;
          try {
            ev = JSON.parse(payload);
          } catch {
            continue;
          }
          if (ev.type === "message_start" && ev.message?.usage) {
            inputTokens = ev.message.usage.input_tokens ?? 0;
          }
          if (ev.type === "content_block_delta" && ev.delta?.text) {
            yield { delta: ev.delta.text };
          }
          if (ev.type === "message_delta" && ev.usage) {
            outputTokens = ev.usage.output_tokens ?? outputTokens;
          }
          if (ev.type === "message_stop") {
            const usage: TokenUsage = {
              promptTokens: inputTokens,
              completionTokens: outputTokens,
              totalTokens: inputTokens + outputTokens
            };
            yield { delta: "", done: true, usage };
            return;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    yield {
      delta: "",
      done: true,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens
      }
    };
  }
}
