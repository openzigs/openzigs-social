/**
 * Inbound DM dispatcher (#144).
 *
 * A small, composable rule-chain engine for inbound social DMs. Every inbound
 * message (delivered by a connector's webhook handler → SocialBrain) is run
 * through an ordered list of {@link DmRule}s. The dispatcher:
 *
 *   1. emits an `inbox:message` Socket.IO event so the unified inbox (#71)
 *      lights up immediately, then
 *   2. runs each rule in order, threading a shared mutable {@link DmContext}.
 *
 * A rule can short-circuit the chain by calling `ctx.stop()` (e.g. the
 * human-ownership guard halts AI processing on a thread a human has taken
 * over). Rules integrate the shared primitives — {@link HandoffManager} and
 * {@link ApprovalQueue} — rather than re-implementing them.
 *
 * The engine is connector-agnostic and side-effect-light: it owns no I/O of
 * its own beyond the injected `emit`, so it is fully unit-testable.
 */
import type { ApprovalQueue } from "../../approvals/index.js";
import type { HandoffManager } from "../../handoff/index.js";

/** Emit sink for dispatcher events (wired to `io.emit` in production). */
export type EmitFn = (event: string, payload: unknown) => void;

/** A normalized inbound direct message. */
export interface InboundDm {
  platform: string;
  /** SocialBrain thread id (string form) — used for handoff ownership. */
  threadId: string;
  /** Platform-native message id. */
  messageId: string;
  /** Message body. */
  text: string;
  /** SocialBrain contact id, when resolved. */
  contactId?: number;
  /** Sender handle/display, for inbox rendering. */
  from?: string;
  /** Unix epoch ms the message was received. */
  receivedAt: number;
}

/** Shared, mutable context threaded through the rule chain. */
export interface DmContext {
  readonly message: InboundDm;
  readonly handoff: HandoffManager;
  readonly approvals: ApprovalQueue;
  readonly emit: EmitFn;
  /** Halt the remaining rules. */
  stop(): void;
  /** Whether the chain has been stopped. */
  readonly stopped: boolean;
  /** Free-form bag for rules to pass data down the chain. */
  readonly state: Record<string, unknown>;
}

/** One composable processing step. May be async; may call `ctx.stop()`. */
export type DmRule = (ctx: DmContext) => Promise<void> | void;

/** Outcome of dispatching a single inbound DM. */
export interface DispatchResult {
  /** Whether the chain ran to completion (false ⇒ a rule stopped it). */
  completed: boolean;
  /** Number of rules executed. */
  rulesRun: number;
}

export interface DmDispatcherDeps {
  handoff: HandoffManager;
  approvals: ApprovalQueue;
  emit: EmitFn;
  /** Initial rule chain (order preserved). More can be added via `use`. */
  rules?: DmRule[];
}

export class DmDispatcher {
  private readonly rules: DmRule[];
  private readonly handoff: HandoffManager;
  private readonly approvals: ApprovalQueue;
  private readonly emit: EmitFn;

  constructor(deps: DmDispatcherDeps) {
    this.handoff = deps.handoff;
    this.approvals = deps.approvals;
    this.emit = deps.emit;
    this.rules = [...(deps.rules ?? [])];
  }

  /** Append a rule to the chain. Returns `this` for fluent composition. */
  use(rule: DmRule): this {
    this.rules.push(rule);
    return this;
  }

  /** Process one inbound DM through the chain. */
  async dispatch(message: InboundDm): Promise<DispatchResult> {
    // 1. Surface the message to the unified inbox immediately.
    this.emit("inbox:message", {
      platform: message.platform,
      threadId: message.threadId,
      messageId: message.messageId,
      contactId: message.contactId,
      from: message.from,
      text: message.text,
      receivedAt: message.receivedAt
    });

    // 2. Run the rule chain.
    let stopped = false;
    const ctx: DmContext = {
      message,
      handoff: this.handoff,
      approvals: this.approvals,
      emit: this.emit,
      stop: () => {
        stopped = true;
      },
      get stopped() {
        return stopped;
      },
      state: {}
    };

    let rulesRun = 0;
    for (const rule of this.rules) {
      if (stopped) break;
      await rule(ctx);
      rulesRun += 1;
    }

    return { completed: !stopped, rulesRun };
  }
}

/**
 * Built-in rule: stop the chain when the thread is human-owned, so the AI never
 * acts on a conversation a human has taken over (handoff invariant).
 */
export function humanOwnedGuard(): DmRule {
  return (ctx) => {
    if (ctx.handoff.isHumanOwned(ctx.message.threadId)) {
      ctx.emit("inbox:skipped", {
        threadId: ctx.message.threadId,
        reason: "human-owned"
      });
      ctx.stop();
    }
  };
}

/**
 * Built-in rule factory: request human approval for an AI-drafted reply via the
 * shared {@link ApprovalQueue}, and invoke `onApproved` only when the reviewer
 * approves. The draft itself is produced by the injected `draft` callback so
 * this rule stays independent of the LLM/reply pipeline (#78).
 */
export function approvalGatedReply(opts: {
  draft: (message: InboundDm) => Promise<string> | string;
  onApproved: (reply: string, ctx: DmContext) => Promise<void> | void;
  timeoutMs?: number;
}): DmRule {
  return async (ctx) => {
    const reply = await opts.draft(ctx.message);
    const outcome = await ctx.approvals.request(
      {
        kind: "dm-reply",
        platform: ctx.message.platform,
        threadId: ctx.message.threadId,
        draft: reply
      },
      { timeoutMs: opts.timeoutMs }
    );
    if (outcome.decision === "approve") {
      // Allow the reviewer to edit the draft before sending.
      const finalReply =
        typeof outcome.metadata?.draft === "string" ? outcome.metadata.draft : reply;
      await opts.onApproved(finalReply, ctx);
    }
  };
}
