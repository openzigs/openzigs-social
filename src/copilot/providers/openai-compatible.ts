/**
 * OpenAI-compatible streaming chat provider.
 *
 * Works for OpenAI proper, Groq, Together, OpenRouter, and Ollama
 * (`baseUrl: http://localhost:11434/v1`). The wire shape is the OpenAI
 * Chat Completions SSE protocol.
 */
import type { ChatChunk, ChatOptions, Provider, ProviderConfig, TokenUsage } from "./types.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export class OpenAICompatibleProvider implements Provider {
  constructor(public readonly config: ProviderConfig) {
    if (config.kind !== "openai" && config.kind !== "openai-compatible") {
      throw new Error(`OpenAICompatibleProvider: bad kind ${config.kind}`);
    }
  }

  async *chat(opts: ChatOptions): AsyncIterable<ChatChunk> {
    const base = (this.config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    const url = `${base}/chat/completions`;
    const model = opts.model ?? this.config.model;
    if (!model) throw new Error("openai-compatible: model is required");

    const body = {
      model,
      stream: true,
      messages: opts.messages,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      // Only send `max_tokens` when a caller explicitly caps it. Local "thinking"
      // models (e.g. gemma4:12b) spend completion tokens on a separate
      // `reasoning` field before emitting `content`, so a tiny `max_tokens` can
      // be exhausted by reasoning and yield empty `content`. Callers must not set
      // a small cap for local models; omitting it lets Ollama run to completion.
      ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {})
    };

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "text/event-stream"
    };
    if (this.config.apiKey) {
      headers.authorization = `Bearer ${this.config.apiKey}`;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: opts.signal
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`openai-compatible: HTTP ${res.status} ${text.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let usage: TokenUsage | undefined;

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
          if (payload === "[DONE]") {
            yield { delta: "", done: true, usage };
            return;
          }
          let chunk: OpenAIStreamChunk;
          try {
            chunk = JSON.parse(payload);
          } catch {
            continue;
          }
          if (chunk.usage) {
            usage = {
              promptTokens: chunk.usage.prompt_tokens ?? 0,
              completionTokens: chunk.usage.completion_tokens ?? 0,
              totalTokens: chunk.usage.total_tokens ?? 0
            };
          }
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) yield { delta };
        }
      }
    } finally {
      reader.releaseLock();
    }
    yield { delta: "", done: true, usage };
  }
}
