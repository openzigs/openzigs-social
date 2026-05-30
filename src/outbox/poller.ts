/**
 * Outbox poller (#86) — drains due scheduled posts and publishes them.
 *
 * Each {@link tick} atomically claims due rows (`scheduled → publishing`) and
 * publishes each through the per-platform {@link OutboxDispatch}. Retry/backoff
 * and dead-lettering are NOT reimplemented here — they are delegated to the
 * shared platform-service helpers ({@link dispatchWithDlq} + {@link DlqRepository}
 * from `src/platform/retry/`). The only outbox-specific input is the explicit
 * backoff schedule the epic mandates:
 *
 *   attempt 1 fails → wait 1m → attempt 2 fails → wait 5m → attempt 3 fails →
 *   wait 30m → attempt 4 fails → wait 2h → attempt 5 fails → dead-letter.
 *
 * The schedule is supplied to `retry()` via an injected `sleep` seam that maps
 * the Nth retry to `OUTBOX_RETRY_SCHEDULE_MS[N]` (the generic helper's computed
 * exponential delay is intentionally ignored in favour of this fixed schedule).
 * On terminal failure the op lands in `outbox_dlq` AND the row is marked
 * `failed` with `last_error`, so the dead-letter surfaces in the UI (#89).
 *
 * Determinism: the clock and the real timer are injectable so tests run under
 * fake timers with zero wall-clock waiting.
 */
import type { DlqRepository } from "../platform/retry/dlq.js";
import { dispatchWithDlq, type RetryOptions } from "../platform/retry/backoff.js";
import type { OutboxDispatch } from "./dispatch.js";
import type { OutboxPost, OutboxRepository } from "./repository.js";

/** Mandated retry delays after a failed publish: 1m, 5m, 30m, 2h. */
export const OUTBOX_RETRY_SCHEDULE_MS: readonly number[] = [
  60_000, // 1 minute
  300_000, // 5 minutes
  1_800_000, // 30 minutes
  7_200_000 // 2 hours
];

/** Minimal logger seam. */
export interface OutboxLogger {
  info?: (msg: string, meta?: Record<string, unknown>) => void;
  error?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface OutboxPollerDeps {
  repo: OutboxRepository;
  dispatch: OutboxDispatch;
  dlq: DlqRepository;
  /** Max rows claimed per tick. Default 25. */
  batchSize?: number;
  /** Backoff schedule (ms). Default {@link OUTBOX_RETRY_SCHEDULE_MS}. */
  retryScheduleMs?: readonly number[];
  /** Classify which publish errors are transient (retryable). Default: all. */
  isTransient?: (err: unknown) => boolean;
  /** Injectable real timer used between retries. Default: `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable clock (epoch ms). Default: `Date.now`. */
  now?: () => number;
  /** Socket emit seam for `outbox:*` events. */
  emit?: (event: string, payload: unknown) => void;
  logger?: OutboxLogger;
}

/** Outcome of a single {@link OutboxPoller.tick}. */
export interface TickResult {
  claimed: number;
  published: number;
  failed: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class OutboxPoller {
  private readonly repo: OutboxRepository;
  private readonly dispatch: OutboxDispatch;
  private readonly dlq: DlqRepository;
  private readonly batchSize: number;
  private readonly schedule: readonly number[];
  private readonly isTransient: (err: unknown) => boolean;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly emit?: (event: string, payload: unknown) => void;
  private readonly logger?: OutboxLogger;

  constructor(deps: OutboxPollerDeps) {
    this.repo = deps.repo;
    this.dispatch = deps.dispatch;
    this.dlq = deps.dlq;
    this.batchSize = deps.batchSize ?? 25;
    this.schedule = deps.retryScheduleMs ?? OUTBOX_RETRY_SCHEDULE_MS;
    this.isTransient = deps.isTransient ?? (() => true);
    this.sleep = deps.sleep ?? defaultSleep;
    this.now = deps.now ?? (() => Date.now());
    this.emit = deps.emit;
    this.logger = deps.logger;
  }

  /** Claim and publish all currently-due posts. */
  async tick(): Promise<TickResult> {
    const claimed = this.repo.claimDue(this.now(), this.batchSize);
    if (claimed.length === 0) {
      return { claimed: 0, published: 0, failed: 0 };
    }
    const outcomes = await Promise.all(claimed.map((post) => this.publishOne(post)));
    const published = outcomes.filter((ok) => ok).length;
    return {
      claimed: claimed.length,
      published,
      failed: claimed.length - published
    };
  }

  /**
   * Publish a single claimed post via the shared retry/DLQ helper using the
   * mandated fixed backoff schedule. Returns true on success.
   */
  private async publishOne(post: OutboxPost): Promise<boolean> {
    // Map the Nth retry to the fixed schedule slot; the generic helper's
    // exponential delay arg is ignored on purpose.
    let retryIndex = 0;
    const schedule = this.schedule;
    const realSleep = this.sleep;
    const options: RetryOptions = {
      maxAttempts: schedule.length + 1,
      isTransient: this.isTransient,
      sleep: async (): Promise<void> => {
        const delay = schedule[retryIndex] ?? schedule[schedule.length - 1] ?? 0;
        retryIndex += 1;
        await realSleep(delay);
      }
    };

    const outcome = await dispatchWithDlq(
      {
        platform: post.platform,
        opKind: "outbox.publish",
        payload: { outboxId: post.id, platform: post.platform, accountId: post.accountId }
      },
      () =>
        this.dispatch.publish({
          platform: post.platform,
          accountId: post.accountId,
          body: post.body,
          media: post.media
        }),
      this.dlq,
      options
    );

    if (outcome.ok) {
      const updated = this.repo.markPublished(post.id, outcome.value.externalId);
      this.logger?.info?.("outbox post published", {
        id: post.id,
        platform: post.platform,
        externalId: outcome.value.externalId
      });
      this.emit?.("outbox:published", {
        id: updated.id,
        platform: updated.platform,
        externalId: updated.externalId,
        publishedAt: updated.publishedAt
      });
      return true;
    }

    const message = errorMessage(outcome.error);
    const updated = this.repo.markFailed(post.id, message, outcome.attempts);
    this.logger?.error?.("outbox post dead-lettered", {
      id: post.id,
      platform: post.platform,
      attempts: outcome.attempts,
      dlqId: outcome.dlqId,
      error: message
    });
    this.emit?.("outbox:failed", {
      id: updated.id,
      platform: updated.platform,
      attempts: updated.attempts,
      lastError: updated.lastError,
      dlqId: outcome.dlqId
    });
    return false;
  }
}
