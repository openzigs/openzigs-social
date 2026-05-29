/**
 * Provider abstraction.
 *
 * A `Provider` is a thin LLM facade. The wrapper (`src/copilot`) calls
 * `chat()` and gets streaming chunks back, regardless of upstream (Copilot,
 * OpenAI, Anthropic, OpenAI-compatible / Ollama).
 *
 * Token-tracking is the wrapper's job — providers just report a usage object
 * on completion when available.
 */

export type ProviderKind = "copilot" | "openai" | "anthropic" | "openai-compatible";

export interface ProviderConfig {
  kind: ProviderKind;
  /** Human-readable id used for logging + vault lookup. */
  name: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  /** Marked true for any provider whose traffic stays on-host (e.g. Ollama). */
  isLocal?: boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatChunk {
  /** Incremental assistant text. */
  delta: string;
  /** Set on the terminal chunk. */
  done?: boolean;
  /** Set on the terminal chunk when the provider exposed usage. */
  usage?: TokenUsage;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface Provider {
  readonly config: ProviderConfig;
  /** Streaming chat. The returned iterator yields deltas and a terminal chunk. */
  chat(opts: ChatOptions): AsyncIterable<ChatChunk>;
}
