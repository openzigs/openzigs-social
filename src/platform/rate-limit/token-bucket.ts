/**
 * Token bucket (#141).
 *
 * A classic refilling token bucket: `capacity` tokens, refilled continuously at
 * `refillPerSec`. Time is read through an injected `now()` so tests drive it
 * with fake timers — there is no internal clock and no real waiting here.
 *
 * `tryConsume(cost)` is non-blocking: it refills based on elapsed time, then
 * either consumes and returns `true`, or returns `false` when there aren't
 * enough tokens. The broker layers awaiting + Socket.IO warnings on top.
 */
export interface TokenBucketOptions {
  /** Maximum tokens the bucket can hold (the "budget"). */
  capacity: number;
  /** Sustained refill rate in tokens per second. */
  refillPerSec: number;
  /** Initial token count. Defaults to `capacity` (starts full). */
  initialTokens?: number;
  /** Injectable clock in ms. Defaults to `Date.now`. */
  now?: () => number;
}

export class TokenBucket {
  readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly now: () => number;
  private tokens: number;
  private lastRefill: number;

  constructor(opts: TokenBucketOptions) {
    if (opts.capacity <= 0) throw new Error("token bucket capacity must be > 0");
    if (opts.refillPerSec < 0) throw new Error("token bucket refillPerSec must be >= 0");
    this.capacity = opts.capacity;
    this.refillPerMs = opts.refillPerSec / 1000;
    this.now = opts.now ?? Date.now;
    this.tokens = Math.min(opts.initialTokens ?? opts.capacity, opts.capacity);
    this.lastRefill = this.now();
  }

  private refill(): void {
    const ts = this.now();
    const elapsed = ts - this.lastRefill;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefill = ts;
  }

  /** Current available tokens (after refilling to "now"). */
  available(): number {
    this.refill();
    return this.tokens;
  }

  /** Tokens consumed relative to capacity, in `[0, 1]`. */
  utilization(): number {
    return 1 - this.available() / this.capacity;
  }

  /** Attempt to consume `cost` tokens. Returns true on success. */
  tryConsume(cost = 1): boolean {
    if (cost <= 0) return true;
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }

  /**
   * Milliseconds until `cost` tokens will be available (0 when already
   * available). `Infinity` when the bucket never refills and lacks the tokens.
   */
  msUntilAvailable(cost = 1): number {
    this.refill();
    if (this.tokens >= cost) return 0;
    if (this.refillPerMs <= 0) return Infinity;
    return Math.ceil((cost - this.tokens) / this.refillPerMs);
  }
}
