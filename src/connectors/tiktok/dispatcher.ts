/**
 * TikTok op dispatcher — the seam between the TikTok connector and the
 * platform-service rate-limit (#141) + retry/DLQ (#142) ports. Mirrors the
 * Meta/LinkedIn/Pinterest dispatchers exactly, retrying only transient TikTok
 * errors. Owns no epic-local rate-limit or retry logic.
 */
import {
  dispatchWithDlq,
  type DispatchOutcome,
  type DlqRepository,
  type RateLimitBroker,
  type RetryOptions
} from "../../platform/index.js";
import { isTransientTikTokError } from "./rest-client.js";

export interface TikTokDispatcherDeps {
  broker: RateLimitBroker;
  dlq: DlqRepository;
  retryOptions?: Omit<RetryOptions, "isTransient">;
  acquireTimeoutMs?: number;
}

const DEFAULT_ACQUIRE_TIMEOUT_MS = 30_000;

export interface TikTokOp {
  platform: string;
  opKind: string;
  payload: unknown;
  cost?: number;
}

export class TikTokDispatcher {
  private readonly broker: RateLimitBroker;
  private readonly dlq: DlqRepository;
  private readonly retryOptions: Omit<RetryOptions, "isTransient">;
  private readonly acquireTimeoutMs: number;

  constructor(deps: TikTokDispatcherDeps) {
    this.broker = deps.broker;
    this.dlq = deps.dlq;
    this.retryOptions = deps.retryOptions ?? {};
    this.acquireTimeoutMs = deps.acquireTimeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS;
  }

  async dispatch<T>(op: TikTokOp, run: () => Promise<T>): Promise<DispatchOutcome<T>> {
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
      { ...this.retryOptions, isTransient: isTransientTikTokError }
    );
  }
}
