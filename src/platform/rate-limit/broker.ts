/**
 * Rate-limit broker (#141).
 *
 * Per-platform token buckets + optional hard quotas (YouTube units, X credits)
 * with a Socket.IO warning when a budget crosses 80% utilisation. Connectors
 * call `acquire(platform, { cost, timeoutMs })` before each API call; the
 * broker decrements the bucket (and quota) or awaits a refill up to the
 * timeout — never tight-looping.
 *
 * Determinism: `now` and `sleep` are injectable seams, so every behaviour
 * (refill timing, awaiting, timeouts, the 80% warning) is exercised under
 * `vi.useFakeTimers()` with no real clocks.
 */
import { TokenBucket } from "./token-bucket.js";

/** Default utilisation at which a warning fires. */
export const DEFAULT_WARN_THRESHOLD = 0.8;

/** Emit sink for broker events (wired to `io.emit` in production). */
export type EmitFn = (event: string, payload: unknown) => void;

/** Per-platform budget configuration. */
export interface PlatformBudget {
  /** Token-bucket capacity (the time-window budget). */
  capacity: number;
  /** Sustained refill rate, tokens per second. */
  refillPerSec: number;
  /**
   * Optional hard quota independent of the time window (e.g. daily YouTube
   * units). Decremented per `acquire`; once exhausted, acquisitions fail with
   * reason `"quota"` until {@link RateLimitBroker.resetQuota} is called.
   */
  quota?: number;
}

/** Construction options for {@link RateLimitBroker}. */
export interface RateLimitBrokerOptions {
  /** Initial per-platform budgets. */
  budgets?: Record<string, PlatformBudget>;
  /** Socket.IO emit sink. When omitted, warnings are dropped. */
  emit?: EmitFn;
  /** Utilisation in `[0,1]` at which to warn. Default 0.8. */
  warnThreshold?: number;
  /** Injectable clock in ms. Default `Date.now`. */
  now?: () => number;
  /** Injectable delay. Default real `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
}

/** Outcome of an {@link RateLimitBroker.acquire}. */
export type AcquireResult =
  | { granted: true }
  | { granted: false; reason: "timeout" | "quota" | "unknown-platform" };

/** Socket.IO `rate-limit:warning` payload. */
export interface RateLimitWarning {
  platform: string;
  /** The budget (bucket capacity). */
  budget: number;
  /** Tokens consumed relative to the budget. */
  used: number;
}

interface PlatformState {
  bucket: TokenBucket;
  quotaRemaining?: number;
  quotaInitial?: number;
  warned: boolean;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RateLimitBroker {
  private readonly states = new Map<string, PlatformState>();
  private readonly emit?: EmitFn;
  private readonly warnThreshold: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: RateLimitBrokerOptions = {}) {
    this.emit = opts.emit;
    this.warnThreshold = opts.warnThreshold ?? DEFAULT_WARN_THRESHOLD;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? defaultSleep;
    for (const [platform, budget] of Object.entries(opts.budgets ?? {})) {
      this.configure(platform, budget);
    }
  }

  /** Register or replace a platform's budget. */
  configure(platform: string, budget: PlatformBudget): void {
    this.states.set(platform, {
      bucket: new TokenBucket({
        capacity: budget.capacity,
        refillPerSec: budget.refillPerSec,
        now: this.now
      }),
      quotaRemaining: budget.quota,
      quotaInitial: budget.quota,
      warned: false
    });
  }

  /** Whether a platform is configured. */
  has(platform: string): boolean {
    return this.states.has(platform);
  }

  /** Reset a platform's hard quota to its initial value (e.g. daily rollover). */
  resetQuota(platform: string): void {
    const state = this.states.get(platform);
    if (state) state.quotaRemaining = state.quotaInitial;
  }

  /** Remaining hard quota for a platform, or `undefined` when none is set. */
  remainingQuota(platform: string): number | undefined {
    return this.states.get(platform)?.quotaRemaining;
  }

  private maybeWarn(platform: string, state: PlatformState): void {
    const utilization = state.bucket.utilization();
    if (utilization >= this.warnThreshold) {
      if (!state.warned) {
        state.warned = true;
        const used = Math.round(state.bucket.capacity * utilization);
        const payload: RateLimitWarning = {
          platform,
          budget: state.bucket.capacity,
          used
        };
        this.emit?.("rate-limit:warning", payload);
      }
    } else {
      // Re-arm once we drop back below the threshold.
      state.warned = false;
    }
  }

  /**
   * Acquire `cost` slots for `platform`, awaiting a refill up to `timeoutMs`.
   * Resolves `{ granted: true }` on success, otherwise a structured failure.
   */
  async acquire(
    platform: string,
    opts: { cost?: number; timeoutMs?: number } = {}
  ): Promise<AcquireResult> {
    const state = this.states.get(platform);
    if (!state) return { granted: false, reason: "unknown-platform" };

    const cost = opts.cost ?? 1;
    const deadline = opts.timeoutMs !== undefined ? this.now() + opts.timeoutMs : undefined;

    // Hard quota is enforced before time-window rate limiting.
    if (state.quotaRemaining !== undefined && state.quotaRemaining < cost) {
      return { granted: false, reason: "quota" };
    }

    // Sample current utilisation so a bucket that has refilled below the
    // threshold re-arms the warning before this acquisition pushes it back up.
    this.maybeWarn(platform, state);

    for (;;) {
      if (state.bucket.tryConsume(cost)) {
        if (state.quotaRemaining !== undefined) state.quotaRemaining -= cost;
        this.maybeWarn(platform, state);
        return { granted: true };
      }

      const waitMs = state.bucket.msUntilAvailable(cost);
      if (!Number.isFinite(waitMs)) return { granted: false, reason: "timeout" };

      if (deadline !== undefined) {
        const remaining = deadline - this.now();
        if (remaining <= 0 || waitMs > remaining) {
          return { granted: false, reason: "timeout" };
        }
      }
      await this.sleep(waitMs);
    }
  }

  /** Non-blocking single-slot check used by callers that can't await. */
  tryAcquire(platform: string, cost = 1): AcquireResult {
    const state = this.states.get(platform);
    if (!state) return { granted: false, reason: "unknown-platform" };
    if (state.quotaRemaining !== undefined && state.quotaRemaining < cost) {
      return { granted: false, reason: "quota" };
    }
    this.maybeWarn(platform, state);
    if (!state.bucket.tryConsume(cost)) return { granted: false, reason: "timeout" };
    if (state.quotaRemaining !== undefined) state.quotaRemaining -= cost;
    this.maybeWarn(platform, state);
    return { granted: true };
  }
}
