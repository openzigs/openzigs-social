/**
 * Per-thread handoff manager.
 *
 * Lets a human "take over" a conversation thread that the AI is (or might be)
 * drafting a reply for: it cancels any in-flight draft generation for that
 * thread and flips the thread's ownership to `human`. Consumed by the unified
 * inbox (#71), Telegram remote control (#47), and the auto-reply pipeline
 * (#78), which registers its `AbortController` per thread so `takeOver` can
 * abort it.
 *
 * The cancellation contract is deliberately minimal so the future auto-reply
 * pipeline can plug in without coupling to a concrete draft generator: callers
 * `register(threadId)` (which mints an `AbortController`) — or
 * `register(threadId, controller)` with their own — wire the returned
 * `signal` into whatever does the work, and `unregister` when the draft
 * settles. `takeOver` aborts every controller still registered for the thread.
 *
 * Aborting is synchronous, so the "cancel within 2s" guarantee is met
 * trivially: the `AbortSignal` fires before `takeOver` returns.
 *
 * Ownership state is **in-memory by default**. Threads default to `ai`
 * ownership; `list()` exposes the current non-default state for snapshotting.
 */
import { EventEmitter } from "node:events";

/** Who currently owns a thread. */
export type ThreadOwner = "ai" | "human";

/** Emitted whenever a thread's ownership changes. */
export interface OwnershipChange {
  threadId: string;
  owner: ThreadOwner;
  previous: ThreadOwner;
  /** Optional caller-supplied reason (e.g. "manual", "low-confidence"). */
  reason?: string;
  /** Unix epoch ms when ownership changed. */
  at: number;
}

/** A thread whose ownership differs from the default. */
export interface ThreadOwnership {
  threadId: string;
  owner: ThreadOwner;
}

/** Construction options for {@link HandoffManager}. */
export interface HandoffManagerOptions {
  /** Override the clock (tests). */
  now?: () => number;
}

/** Typed event map emitted by {@link HandoffManager}. */
export interface HandoffManagerEvents {
  "ownership.change": [OwnershipChange];
}

export class HandoffManager extends EventEmitter {
  /** Threads explicitly owned by a human. Absence ⇒ default `ai`. */
  private readonly humanOwned = new Set<string>();
  /** In-flight draft controllers per thread. */
  private readonly controllers = new Map<string, Set<AbortController>>();
  private readonly now: () => number;

  constructor(opts: HandoffManagerOptions = {}) {
    super();
    this.now = opts.now ?? Date.now;
  }

  /**
   * Register an in-flight draft generation for a thread. Returns the
   * `AbortController` whose `signal` should be threaded into the draft work,
   * and an `unregister` callback to call when the draft settles.
   *
   * If the thread is already human-owned, the returned controller is aborted
   * immediately so the AI never drafts on a human-owned thread.
   */
  register(
    threadId: string,
    controller: AbortController = new AbortController()
  ): { controller: AbortController; unregister: () => void } {
    this.assertThreadId(threadId);

    if (this.humanOwned.has(threadId)) {
      controller.abort();
      return { controller, unregister: () => undefined };
    }

    let set = this.controllers.get(threadId);
    if (!set) {
      set = new Set();
      this.controllers.set(threadId, set);
    }
    set.add(controller);

    const prune = (): void => {
      const current = this.controllers.get(threadId);
      if (!current) return;
      current.delete(controller);
      if (current.size === 0) this.controllers.delete(threadId);
    };

    // Self-healing: if the consumer aborts the controller for *any* reason
    // other than takeOver (e.g. normal completion or cancellation) and forgets
    // to call `unregister`, auto-prune it so it never leaks. This emits no
    // ownership change — it only frees the slot. `{ once: true }` removes the
    // listener after it fires; `unregister` removes it explicitly otherwise.
    const onAbort = (): void => {
      prune();
    };
    controller.signal.addEventListener("abort", onAbort, { once: true });

    const unregister = (): void => {
      controller.signal.removeEventListener("abort", onAbort);
      prune();
    };

    return { controller, unregister };
  }

  /**
   * Take over a thread: abort all in-flight draft controllers and mark the
   * thread human-owned. Idempotent — taking over an already human-owned thread
   * still aborts any stragglers but emits at most one change event.
   */
  takeOver(threadId: string, reason?: string): void {
    this.assertThreadId(threadId);
    this.abortAll(threadId);

    if (this.humanOwned.has(threadId)) return;
    this.humanOwned.add(threadId);
    this.emitChange(threadId, "human", "ai", reason);
  }

  /**
   * Release a thread back to AI ownership. No-op if it isn't human-owned.
   */
  release(threadId: string, reason?: string): void {
    this.assertThreadId(threadId);
    if (!this.humanOwned.has(threadId)) return;
    this.humanOwned.delete(threadId);
    this.emitChange(threadId, "ai", "human", reason);
  }

  /** Whether a thread is currently human-owned. */
  isHumanOwned(threadId: string): boolean {
    return this.humanOwned.has(threadId);
  }

  /** Current owner of a thread (`ai` by default). */
  owner(threadId: string): ThreadOwner {
    return this.humanOwned.has(threadId) ? "human" : "ai";
  }

  /** Snapshot of all threads whose ownership differs from the default. */
  list(): ThreadOwnership[] {
    return Array.from(this.humanOwned, (threadId) => ({ threadId, owner: "human" as const }));
  }

  /**
   * Number of in-flight draft controllers currently registered for a thread
   * (mostly for tests / observability). Aborted controllers are auto-pruned,
   * so this reflects only controllers still considered in-flight.
   */
  registeredCount(threadId: string): number {
    return this.controllers.get(threadId)?.size ?? 0;
  }

  private abortAll(threadId: string): void {
    const set = this.controllers.get(threadId);
    if (!set) return;
    // Snapshot before iterating: aborting each controller synchronously fires
    // its auto-prune `abort` listener, which mutates this same set.
    for (const controller of Array.from(set)) {
      if (!controller.signal.aborted) controller.abort();
    }
    this.controllers.delete(threadId);
  }

  private emitChange(
    threadId: string,
    owner: ThreadOwner,
    previous: ThreadOwner,
    reason?: string
  ): void {
    const change: OwnershipChange = {
      threadId,
      owner,
      previous,
      at: this.now(),
      ...(reason !== undefined ? { reason } : {})
    };
    this.emit("ownership.change", change);
  }

  private assertThreadId(threadId: string): void {
    if (typeof threadId !== "string" || threadId.length === 0) {
      throw new Error("threadId must be a non-empty string");
    }
  }
}

export interface HandoffManager {
  on<E extends keyof HandoffManagerEvents>(
    event: E,
    listener: (...args: HandoffManagerEvents[E]) => void
  ): this;
  once<E extends keyof HandoffManagerEvents>(
    event: E,
    listener: (...args: HandoffManagerEvents[E]) => void
  ): this;
  off<E extends keyof HandoffManagerEvents>(
    event: E,
    listener: (...args: HandoffManagerEvents[E]) => void
  ): this;
  emit<E extends keyof HandoffManagerEvents>(event: E, ...args: HandoffManagerEvents[E]): boolean;
}
