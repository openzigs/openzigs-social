/**
 * Pinterest op dispatcher — the seam between the Pinterest connector and the
 * platform-service rate-limit (#141) + retry/DLQ (#142) ports. Mirrors the
 * Meta/LinkedIn dispatchers exactly: acquire a slot, then run with retry +
 * DLQ landing, retrying only transient Pinterest errors. Owns no epic-local
 * rate-limit or retry logic.
 */
import {
  dispatchWithDlq,
  type DispatchOutcome,
  type DlqRepository,
  type RateLimitBroker,
  type RetryOptions
} from "../../platform/index.js";
import { isTransientPinterestError } from "./rest-client.js";

export interface PinterestDispatcherDeps {
  broker: RateLimitBroker;
  dlq: DlqRepository;
  retryOptions?: Omit<RetryOptions, "isTransient">;
  acquireTimeoutMs?: number;
}

const DEFAULT_ACQUIRE_TIMEOUT_MS = 30_000;

export interface PinterestOp {
  platform: string;
  opKind: string;
  payload: unknown;
  cost?: number;
}

export class PinterestDispatcher {
  private readonly broker: RateLimitBroker;
  private readonly dlq: DlqRepository;
  private readonly retryOptions: Omit<RetryOptions, "isTransient">;
  private readonly acquireTimeoutMs: number;

  constructor(deps: PinterestDispatcherDeps) {
    this.broker = deps.broker;
    this.dlq = deps.dlq;
    this.retryOptions = deps.retryOptions ?? {};
    this.acquireTimeoutMs = deps.acquireTimeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS;
  }

  async dispatch<T>(op: PinterestOp, run: () => Promise<T>): Promise<DispatchOutcome<T>> {
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
      { ...this.retryOptions, isTransient: isTransientPinterestError }
    );
  }
}
