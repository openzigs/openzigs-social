/**
 * X (Twitter) op dispatcher — the seam between the X connector and the
 * platform-service rate-limit (#141) + retry/DLQ (#142) ports.
 *
 * Every *outbound* REST call (tweet, reply, DM send, DM/analytics fetch) flows
 * through {@link TwitterDispatcher.dispatch}, which mirrors the LinkedIn/Meta
 * dispatchers exactly:
 *
 *   1. Acquires a slot from the shared {@link RateLimitBroker} BEFORE the call,
 *      so one X budget envelope governs every X call (X's 15-req/15-min window
 *      and friends are encoded as broker budgets at wiring time).
 *   2. On a denied acquisition lands the op in the DLQ and returns a structured
 *      failure — it never throws, so the caller's drain loop keeps running.
 *   3. Otherwise runs the op through {@link dispatchWithDlq}, retrying only
 *      *transient* X errors (`isTransientTwitterError`) with the platform's
 *      exponential backoff.
 *
 * No epic-local rate-limit or retry logic lives here — this is pure wiring.
 */
import {
  dispatchWithDlq,
  type DispatchOutcome,
  type DlqRepository,
  type RateLimitBroker,
  type RetryOptions
} from "../../platform/index.js";
import { isTransientTwitterError } from "./rest-client.js";

export interface TwitterDispatcherDeps {
  /** Shared rate-limit broker (#141). */
  broker: RateLimitBroker;
  /** Dead-letter queue repository (#142). */
  dlq: DlqRepository;
  /** Backoff/retry seams (injected `sleep`/`random` in tests). */
  retryOptions?: Omit<RetryOptions, "isTransient">;
  /** Max time to wait for a rate-limit slot before giving up. Default 30s. */
  acquireTimeoutMs?: number;
}

const DEFAULT_ACQUIRE_TIMEOUT_MS = 30_000;

/** Identity of an outbound op for budgeting + DLQ bookkeeping. */
export interface TwitterOp {
  /** Budget key, e.g. `"twitter"` or `"twitter-dm"`. */
  platform: string;
  /** Operation kind for DLQ rows, e.g. `"twitter.publish"`. */
  opKind: string;
  /** Payload stored verbatim in the DLQ on terminal failure (no secrets). */
  payload: unknown;
  /** Rate-limit cost of this op. Default 1. */
  cost?: number;
}

export class TwitterDispatcher {
  private readonly broker: RateLimitBroker;
  private readonly dlq: DlqRepository;
  private readonly retryOptions: Omit<RetryOptions, "isTransient">;
  private readonly acquireTimeoutMs: number;

  constructor(deps: TwitterDispatcherDeps) {
    this.broker = deps.broker;
    this.dlq = deps.dlq;
    this.retryOptions = deps.retryOptions ?? {};
    this.acquireTimeoutMs = deps.acquireTimeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS;
  }

  /**
   * Acquire budget, then run `op` with retry + DLQ landing. Never throws — the
   * outcome is returned for the caller to act on.
   */
  async dispatch<T>(op: TwitterOp, run: () => Promise<T>): Promise<DispatchOutcome<T>> {
    const acquired = await this.broker.acquire(op.platform, {
      cost: op.cost ?? 1,
      timeoutMs: this.acquireTimeoutMs
    });
    if (!acquired.granted) {
      const entry = this.dlq.land({
        platform: op.platform,
        opKind: op.opKind,
        payload: op.payload,
        lastError: `rate-limit denied: ${acquired.reason}`,
        attempts: 0
      });
      return {
        ok: false,
        attempts: 0,
        error: new Error(`rate-limit:${acquired.reason}`),
        dlqId: entry.id
      };
    }

    return dispatchWithDlq(
      { platform: op.platform, opKind: op.opKind, payload: op.payload },
      run,
      this.dlq,
      { ...this.retryOptions, isTransient: isTransientTwitterError }
    );
  }
}
