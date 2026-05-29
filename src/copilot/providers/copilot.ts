/**
 * Copilot provider — wraps `@github/copilot-sdk` v0.3.
 *
 * The SDK spawns a local Copilot CLI process and exposes a session whose
 * `assistant.message` events deliver the streamed reply. We translate that
 * into our internal `ChatChunk` stream.
 *
 * Note: 0.3 added `convertMcpCallToolResult` + `createSessionFsAdapter` and
 * renamed `MCP{Local,Remote}ServerConfig` → `MCP{Stdio,HTTP}ServerConfig`.
 * We don't depend on those; the `CopilotClient` / `CopilotSession` surface
 * is unchanged for our use.
 */
import { CopilotClient, type CopilotSession, approveAll } from "@github/copilot-sdk";

import type { ChatChunk, ChatOptions, Provider, ProviderConfig } from "./types.js";

export interface CopilotProviderOptions {
  /** Injectable factory for the SDK client (tests use this). */
  clientFactory?: () => CopilotClient;
  /** Model to use; defaults to "gpt-4". */
  defaultModel?: string;
}

export class CopilotProvider implements Provider {
  readonly config: ProviderConfig;
  private client: CopilotClient | null = null;
  private readonly clientFactory: () => CopilotClient;

  constructor(config: ProviderConfig, opts: CopilotProviderOptions = {}) {
    if (config.kind !== "copilot") {
      throw new Error(`CopilotProvider: bad kind ${config.kind}`);
    }
    this.config = { ...config, model: config.model ?? opts.defaultModel ?? "gpt-4" };
    this.clientFactory = opts.clientFactory ?? (() => new CopilotClient());
  }

  private ensureClient(): CopilotClient {
    if (!this.client) this.client = this.clientFactory();
    return this.client;
  }

  async *chat(opts: ChatOptions): AsyncIterable<ChatChunk> {
    const client = this.ensureClient();
    const session: CopilotSession = await client.createSession({
      model: opts.model ?? this.config.model ?? "gpt-4",
      onPermissionRequest: approveAll
    });

    // Compose the prompt by concatenating non-system messages (Copilot CLI
    // owns its own system prompt). System messages collapse into a prefix.
    const system = opts.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n");
    const turns = opts.messages
      .filter((m) => m.role !== "system")
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");
    const prompt = system ? `${system}\n\n${turns}` : turns;

    const queue: ChatChunk[] = [];
    let resolveNext: ((v: ChatChunk | null) => void) | null = null;
    let done = false;

    const push = (chunk: ChatChunk | null) => {
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r(chunk);
      } else if (chunk) {
        queue.push(chunk);
      }
    };

    session.on((event) => {
      if (event.type === "assistant.message") {
        const data = event.data as { content?: string };
        if (data.content) push({ delta: data.content });
      }
    });

    try {
      await session.sendAndWait({ prompt });
    } finally {
      done = true;
      push(null);
      await session.disconnect().catch(() => undefined);
    }

    while (queue.length || !done) {
      const next: ChatChunk | null = queue.length
        ? queue.shift()!
        : await new Promise<ChatChunk | null>((r) => (resolveNext = r));
      if (next === null) break;
      yield next;
    }
    yield { delta: "", done: true };
  }
}
