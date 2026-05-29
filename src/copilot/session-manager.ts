/**
 * Session manager + per-session token tracking.
 *
 * Each session has an id, a list of messages, a provider selection (made by
 * the smart router on `send`), and a running token counter. On every
 * streamed chunk the manager emits `session.tokens.update` so consumers
 * (Socket.IO, persistence) can react.
 */
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

import type { PrivacyController } from "./privacy.js";
import type { ChatMessage, Provider, TokenUsage } from "./providers/index.js";
import type { SmartRouter } from "./smart-router.js";

export interface SessionTokens {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface SessionRow {
  id: string;
  createdAt: number;
  messages: ChatMessage[];
  tokens: SessionTokens;
  lastProvider?: string;
  lastDecision?: "local" | "cloud";
}

export interface SendOptions {
  prompt: string;
  signal?: AbortSignal;
  /** Per-call provider override (skips the router). */
  provider?: Provider;
  /** Per-call model override. */
  model?: string;
}

export interface StreamEvent {
  sessionId: string;
  delta: string;
  tokens: SessionTokens;
}

export interface SendResult {
  sessionId: string;
  content: string;
  tokens: SessionTokens;
  provider: string;
  decision: "local" | "cloud";
}

const ZERO_TOKENS: SessionTokens = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0
};

export class SessionManager extends EventEmitter {
  private readonly sessions = new Map<string, SessionRow>();

  constructor(
    private readonly router: SmartRouter,
    private readonly privacy?: PrivacyController
  ) {
    super();
  }

  create(systemPrompt?: string): SessionRow {
    const id = randomUUID();
    const messages: ChatMessage[] = systemPrompt ? [{ role: "system", content: systemPrompt }] : [];
    const row: SessionRow = {
      id,
      createdAt: Date.now(),
      messages,
      tokens: { ...ZERO_TOKENS }
    };
    this.sessions.set(id, row);
    this.emit("session.create", { sessionId: id });
    return row;
  }

  get(id: string): SessionRow | undefined {
    return this.sessions.get(id);
  }

  list(): SessionRow[] {
    return Array.from(this.sessions.values());
  }

  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  /**
   * Send a prompt on a session. Streams deltas, emits `session.tokens.update`
   * after every chunk, returns the final assembled content + token totals.
   */
  async send(sessionId: string, opts: SendOptions): Promise<SendResult> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`session not found: ${sessionId}`);
    session.messages.push({ role: "user", content: opts.prompt });

    const route = opts.provider
      ? {
          provider: opts.provider,
          decision: "local" as const,
          estimatedTokens: 0,
          reason: "default-cloud" as const
        }
      : this.router.route(session.messages);

    if (route.decision === "cloud") {
      this.privacy?.assertCloudAllowed(route.provider.config.name);
    }

    session.lastProvider = route.provider.config.name;
    session.lastDecision = route.decision;

    let content = "";
    let finalUsage: TokenUsage | undefined;
    const ac = opts.signal ? undefined : new AbortController();
    const signal = opts.signal ?? ac?.signal;

    for await (const chunk of route.provider.chat({
      messages: session.messages,
      model: opts.model,
      signal
    })) {
      if (chunk.delta) {
        content += chunk.delta;
        // Optimistic per-chunk completion-token estimate so UI never stalls.
        session.tokens.completionTokens += Math.max(1, Math.ceil(chunk.delta.length / 4));
        session.tokens.totalTokens = session.tokens.promptTokens + session.tokens.completionTokens;
        const evt: StreamEvent = {
          sessionId,
          delta: chunk.delta,
          tokens: { ...session.tokens }
        };
        this.emit("session.tokens.update", evt);
      }
      if (chunk.done && chunk.usage) {
        finalUsage = chunk.usage;
      }
    }

    if (finalUsage) {
      session.tokens = {
        promptTokens: session.tokens.promptTokens + finalUsage.promptTokens,
        completionTokens: finalUsage.completionTokens,
        totalTokens: session.tokens.promptTokens + finalUsage.totalTokens
      };
    }

    session.messages.push({ role: "assistant", content });
    this.emit("session.complete", {
      sessionId,
      content,
      tokens: { ...session.tokens }
    });

    return {
      sessionId,
      content,
      tokens: { ...session.tokens },
      provider: route.provider.config.name,
      decision: route.decision
    };
  }
}
