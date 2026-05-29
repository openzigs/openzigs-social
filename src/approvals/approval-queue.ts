/**
 * In-memory approval queue primitive.
 *
 * A small, composable, framework-agnostic building block shared by every
 * surface that needs a human (or auto-policy) to approve an action before it
 * proceeds: Telegram inline keyboards (#47), the unified inbox (#71), the
 * auto-reply pipeline (#78), the outbox publish flow (#84), and the DM
 * dispatcher (platform-service epic).
 *
 * Design:
 *   - `request(payload, { timeoutMs })` returns a Promise that **always
 *     resolves** — never rejects — so callers can `await` it and branch on the
 *     decision without a try/catch. A timeout resolves with
 *     `{ decision: "timeout" }` so the caller can fall back gracefully.
 *   - A separate `decide(id, decision, metadata?)` settles the awaiting
 *     Promise. Decisions are idempotent and race-safe: a decision arriving
 *     after a timeout (or a double decision) is a no-op and never double-
 *     settles or throws.
 *   - Extends EventEmitter so UIs/channels can subscribe to `request`,
 *     `decision`, and `timeout` events to render and update pending approvals.
 *   - Timed-out / decided requests are removed from the pending map and their
 *     timers cleared — no leaks.
 *
 * State is **in-memory by default**. Pending approvals are intentionally not
 * persisted here: the consuming surfaces (#47/#71) restore their own context
 * from JSONL/SQLite and re-issue requests on restart. `list()` exposes the
 * current pending set so a consumer can snapshot it if desired.
 */
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

import { z } from "zod";

/** Terminal decisions a human / auto-policy can make. */
export type Decision = "approve" | "reject";

/** Decision recorded on an outcome, including the timeout sentinel. */
export type OutcomeDecision = Decision | "timeout";

/** Settled result of an approval request. Always resolved, never rejected. */
export interface ApprovalOutcome {
  /** Stable id of the originating request. */
  id: string;
  /** What was decided. `"timeout"` means no decision arrived in time. */
  decision: OutcomeDecision;
  /** Optional decision metadata (reviewer id, note, edited draft, …). */
  metadata?: Record<string, unknown>;
  /** Unix epoch ms when the outcome was settled. */
  decidedAt: number;
}

/** A request awaiting a decision. */
export interface PendingApproval<P = unknown> {
  /** Stable unique id. */
  id: string;
  /** Caller-supplied payload describing what needs approval. */
  payload: P;
  /** Unix epoch ms when the request was created. */
  createdAt: number;
  /** Effective timeout for this request, or `undefined` if it never expires. */
  timeoutMs?: number;
}

/** Options for {@link ApprovalQueue.request}. */
export interface RequestOptions {
  /**
   * Milliseconds before the request auto-resolves with `{ decision: "timeout" }`.
   * Omit (or pass `0`) to wait indefinitely. Falls back to the queue default.
   */
  timeoutMs?: number;
  /** Override the generated id (useful for restoration / dedupe). */
  id?: string;
}

/** Construction options for {@link ApprovalQueue}. */
export interface ApprovalQueueOptions {
  /** Default timeout applied to requests that don't specify one. */
  defaultTimeoutMs?: number;
  /** Override the clock (tests). */
  now?: () => number;
}

/** Typed event map emitted by {@link ApprovalQueue}. */
export interface ApprovalQueueEvents<P = unknown> {
  request: [PendingApproval<P>];
  decision: [ApprovalOutcome];
  timeout: [ApprovalOutcome];
}

const requestOptionsSchema = z
  .object({
    timeoutMs: z.number().int().nonnegative().optional(),
    id: z.string().min(1).optional()
  })
  .strict();

const decisionSchema = z.enum(["approve", "reject"]);

interface Entry<P> {
  pending: PendingApproval<P>;
  resolve: (outcome: ApprovalOutcome) => void;
  timer?: ReturnType<typeof setTimeout>;
  settled: boolean;
}

export class ApprovalQueue<P = unknown> extends EventEmitter {
  private readonly entries = new Map<string, Entry<P>>();
  private readonly defaultTimeoutMs?: number;
  private readonly now: () => number;

  constructor(opts: ApprovalQueueOptions = {}) {
    super();
    if (opts.defaultTimeoutMs !== undefined) {
      this.defaultTimeoutMs = requestOptionsSchema.shape.timeoutMs.parse(opts.defaultTimeoutMs);
    }
    this.now = opts.now ?? Date.now;
  }

  /**
   * Register an approval request. Resolves with the decision (or a timeout
   * outcome). Never rejects.
   */
  request(payload: P, opts: RequestOptions = {}): Promise<ApprovalOutcome> {
    const parsed = requestOptionsSchema.parse(opts);
    const id = parsed.id ?? randomUUID();
    if (this.entries.has(id)) {
      throw new Error(`approval request already pending: ${id}`);
    }
    const timeoutMs = parsed.timeoutMs ?? this.defaultTimeoutMs;

    const pending: PendingApproval<P> = {
      id,
      payload,
      createdAt: this.now(),
      ...(timeoutMs !== undefined ? { timeoutMs } : {})
    };

    return new Promise<ApprovalOutcome>((resolve) => {
      const entry: Entry<P> = { pending, resolve, settled: false };

      if (timeoutMs !== undefined && timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          this.settle(id, "timeout");
        }, timeoutMs);
        // Don't keep the event loop alive purely for a pending approval.
        entry.timer.unref?.();
      }

      this.entries.set(id, entry);
      this.emit("request", pending);
    });
  }

  /**
   * Settle a pending request with a human / auto-policy decision.
   *
   * Idempotent and race-safe: returns `false` (a no-op) if the id is unknown
   * or already settled — e.g. a decision arriving after a timeout.
   */
  decide(id: string, decision: Decision, metadata?: Record<string, unknown>): boolean {
    const parsed = decisionSchema.parse(decision);
    return this.settle(id, parsed, metadata);
  }

  /** Snapshot of all requests currently awaiting a decision. */
  list(): PendingApproval<P>[] {
    return Array.from(this.entries.values(), (e) => e.pending);
  }

  /** Look up a single pending request by id. */
  get(id: string): PendingApproval<P> | undefined {
    return this.entries.get(id)?.pending;
  }

  /** Whether a request with this id is currently pending. */
  has(id: string): boolean {
    return this.entries.has(id);
  }

  /** Count of requests currently awaiting a decision. */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Settle every pending request with a timeout outcome and clear all timers.
   * Useful on shutdown so awaiting callers don't hang.
   */
  clear(): void {
    for (const id of Array.from(this.entries.keys())) {
      this.settle(id, "timeout");
    }
  }

  private settle(
    id: string,
    decision: OutcomeDecision,
    metadata?: Record<string, unknown>
  ): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.settled) return false;

    entry.settled = true;
    if (entry.timer) clearTimeout(entry.timer);
    this.entries.delete(id);

    const outcome: ApprovalOutcome = {
      id,
      decision,
      decidedAt: this.now(),
      ...(metadata !== undefined ? { metadata } : {})
    };

    entry.resolve(outcome);
    this.emit(decision === "timeout" ? "timeout" : "decision", outcome);
    return true;
  }
}

export interface ApprovalQueue<P> {
  on<E extends keyof ApprovalQueueEvents<P>>(
    event: E,
    listener: (...args: ApprovalQueueEvents<P>[E]) => void
  ): this;
  once<E extends keyof ApprovalQueueEvents<P>>(
    event: E,
    listener: (...args: ApprovalQueueEvents<P>[E]) => void
  ): this;
  off<E extends keyof ApprovalQueueEvents<P>>(
    event: E,
    listener: (...args: ApprovalQueueEvents<P>[E]) => void
  ): this;
  emit<E extends keyof ApprovalQueueEvents<P>>(
    event: E,
    ...args: ApprovalQueueEvents<P>[E]
  ): boolean;
}
