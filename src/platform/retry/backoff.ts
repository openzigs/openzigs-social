/**
 * Generic retry helper with jittered exponential backoff + DLQ landing (#142).
 *
 * Wraps any async operation and retries it on *transient* failures only:
 *   - base delay 1s, 2x multiplier, max 5 attempts, ±25% jitter.
 *   - the caller classifies which errors are transient (`isTransient`); a
 *     non-retryable error (e.g. a 4xx other than 429) fails immediately.
 *   - on terminal failure (budget exhausted OR non-retryable) the payload +
 *     last error are landed in `outbox_dlq` via {@link DlqRepository}.
 *
 * Determinism: the timer (`sleep`) and RNG (`random`) are injectable seams so
 * tests use fake timers and a seeded/stubbed random — no real clocks, no real
 * `Math.random`. {@link computeBackoffMs} is pure and exported for direct
 * assertion.
 */
import type { DlqRepository } from "./dlq.js";

/** Default backoff parameters (mirrors the epic acceptance criteria). */
export const DEFAULT_BASE_DELAY_MS = 1000;
export const DEFAULT_MULTIPLIER = 2;
export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_JITTER_RATIO = 0.25;

/** Tunable backoff inputs. */
export interface BackoffParams {
  baseDelayMs: number;
  multiplier: number;
  jitterRatio: number;
  /** Source of randomness in `[0, 1)`. */
  random: () => number;
}

/**
 * Compute the delay (ms) to wait *before* the given 1-based attempt number.
 * `attempt = 1` is the delay between the first and second tries. Pure.
 *
 * delay = baseDelayMs * multiplier^(attempt-1), scaled by a jitter factor in
 * `[1 - jitterRatio, 1 + jitterRatio)` derived from `random()`.
 */
export function computeBackoffMs(attempt: number, params: BackoffParams): number {
  const raw = params.baseDelayMs * params.multiplier ** (attempt - 1);
  // Map random() in [0,1) to [-1, 1), then to [1-ratio, 1+ratio).
  const jitter = 1 + (params.random() * 2 - 1) * params.jitterRatio;
  return Math.max(0, Math.round(raw * jitter));
}

/** Options for {@link retry}. */
export interface RetryOptions {
  /** Max total attempts (including the first). Default 5. */
  maxAttempts?: number;
  baseDelayMs?: number;
  multiplier?: number;
  jitterRatio?: number;
  /**
   * Classify an error as transient (retryable). Default: retry nothing
   * (every error is terminal) — callers should opt in to transient retries.
   */
  isTransient?: (err: unknown) => boolean;
  /** Injectable delay. Default: real `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable RNG in `[0, 1)`. Default: `Math.random`. */
  random?: () => number;
  /** Called before each scheduled retry (observability/tests). */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

/** Thrown when retries are exhausted or a non-retryable error occurs. */
export class RetryExhaustedError extends Error {
  readonly attempts: number;
  readonly lastError: unknown;
  constructor(attempts: number, lastError: unknown) {
    super(
      `retry exhausted after ${attempts} attempt(s): ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    );
    this.name = "RetryExhaustedError";
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn`, retrying transient failures with jittered exponential backoff.
 * Resolves with `fn`'s value, or rejects with {@link RetryExhaustedError}
 * (whose `attempts`/`lastError` describe the terminal failure).
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const isTransient = options.isTransient ?? (() => false);
  const sleep = options.sleep ?? defaultSleep;
  const params: BackoffParams = {
    baseDelayMs: options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
    multiplier: options.multiplier ?? DEFAULT_MULTIPLIER,
    jitterRatio: options.jitterRatio ?? DEFAULT_JITTER_RATIO,
    random: options.random ?? Math.random
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLast = attempt >= maxAttempts;
      if (isLast || !isTransient(err)) {
        throw new RetryExhaustedError(attempt, err);
      }
      const delayMs = computeBackoffMs(attempt, params);
      options.onRetry?.({ attempt, delayMs, error: err });
      await sleep(delayMs);
    }
  }
  // Unreachable (loop always returns or throws), but satisfies the type checker.
  throw new RetryExhaustedError(maxAttempts, lastError);
}

/** Identity describing the operation for DLQ bookkeeping. */
export interface DispatchOp {
  platform: string;
  opKind: string;
  /** Payload stored verbatim in the DLQ on terminal failure. */
  payload: unknown;
}

/** Successful or dead-lettered dispatch outcome. */
export type DispatchOutcome<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; attempts: number; error: unknown; dlqId: number };

/**
 * Retry `run` and, on terminal failure, land the op in the DLQ. Never throws:
 * the outcome is returned so the outbox/connector caller can keep draining its
 * own queue.
 */
export async function dispatchWithDlq<T>(
  op: DispatchOp,
  run: () => Promise<T>,
  dlq: DlqRepository,
  options: RetryOptions = {}
): Promise<DispatchOutcome<T>> {
  let attempts = 0;
  const wrapped = (): Promise<T> => {
    attempts += 1;
    return run();
  };
  try {
    const value = await retry(wrapped, options);
    return { ok: true, value, attempts };
  } catch (err) {
    const lastError = err instanceof RetryExhaustedError ? err.lastError : (err as unknown);
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    const entry = dlq.land({
      platform: op.platform,
      opKind: op.opKind,
      payload: op.payload,
      lastError: message,
      attempts
    });
    return { ok: false, attempts, error: lastError, dlqId: entry.id };
  }
}
