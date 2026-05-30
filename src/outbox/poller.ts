/**
 * Outbox poller (#86) — drains due scheduled posts and publishes them.
 *
 * Each {@link tick} atomically claims due rows (`scheduled → publishing`) and
 * attempts to publish each **once** through the per-platform {@link OutboxDispatch}.
 * Crucially, retries do NOT block the tick: a transiently-failed publish is
 * re-queued (`publishing → scheduled`) with `publish_at = now + backoffDelay`
 * and simply reappears on a future due-tick. This is what keeps one persistently
 * failing post from starving every other due post — without it, awaiting the
 * backoff `sleep` inside the tick (combined with the scheduler's non-overlap
 * guard) would hold the tick open for up to ~2h36m and block all other posts.
 *
 * The backoff delay comes from the explicit schedule the epic mandates, indexed
 * by the post's `attempts` count (already incremented by the atomic claim):
 *
 *   attempt 1 fails → re-queue +1m → attempt 2 fails → +5m → attempt 3 fails →
 *   +30m → attempt 4 fails → +2h → attempt 5 fails → dead-letter.
 *
 * On terminal failure (schedule exhausted, or a non-transient error) the op
 * lands in `outbox_dlq` AND the row is marked `failed` with `last_error`, so the
 * dead-letter surfaces in the UI (#89). `DlqRepository` lives in
 * `src/platform/retry/` and is reused here; only the across-tick retry is
 * outbox-specific (driven by `publish_at`, not an in-process `sleep`).
 *
 * Determinism: the clock is injectable so tests run under fake timers with zero
 * wall-clock waiting and assert the exact `publish_at` offsets.
 */
import type { DlqRepository } from "../platform/retry/dlq.js";
import { NoPublisherError, type OutboxDispatch } from "./dispatch.js";
import type { OutboxPost, OutboxRepository } from "./repository.js";

/** Mandated backoff delays after a failed publish: 1m, 5m, 30m, 2h. */
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
  /** Posts re-queued for a later retry (`publishing → scheduled`). */
  requeued: number;
  /** Posts dead-lettered this tick (`publishing → failed`). */
  failed: number;
}

/** Per-post outcome of a single publish attempt. */
type PublishOutcome = "published" | "requeued" | "failed";

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
    this.now = deps.now ?? (() => Date.now());
    this.emit = deps.emit;
    this.logger = deps.logger;
  }

  /** Claim and publish all currently-due posts. */
  async tick(): Promise<TickResult> {
    const claimed = this.repo.claimDue(this.now(), this.batchSize);
    if (claimed.length === 0) {
      return { claimed: 0, published: 0, requeued: 0, failed: 0 };
    }
    const outcomes = await Promise.all(claimed.map((post) => this.publishOne(post)));
    return {
      claimed: claimed.length,
      published: outcomes.filter((o) => o === "published").length,
      requeued: outcomes.filter((o) => o === "requeued").length,
      failed: outcomes.filter((o) => o === "failed").length
    };
  }

  /**
   * Attempt to publish a single claimed post **once**. On success → `published`.
   * On a transient failure with retry budget remaining → re-queue via
   * `publish_at` (non-blocking) and return `"requeued"`. On a non-transient
   * failure or once the schedule is exhausted → dead-letter and return
   * `"failed"`. Never sleeps inside the tick.
   */
  private async publishOne(post: OutboxPost): Promise<PublishOutcome> {
    try {
      const result = await this.dispatch.publish({
        platform: post.platform,
        accountId: post.accountId,
        body: post.body,
        media: post.media
      });
      const updated = this.repo.markPublished(post.id, result.externalId);
      this.logger?.info?.("outbox post published", {
        id: post.id,
        platform: post.platform,
        externalId: result.externalId
      });
      this.emit?.("outbox:published", {
        id: updated.id,
        platform: updated.platform,
        externalId: updated.externalId,
        publishedAt: updated.publishedAt
      });
      return "published";
    } catch (err) {
      return this.handleFailure(post, err);
    }
  }

  /**
   * Handle a failed publish attempt. `post.attempts` already counts the attempt
   * just made (incremented by the atomic claim), so it is the 1-based number of
   * the attempt that failed. While it is within the schedule and the error is
   * transient, re-queue with `publish_at = now + schedule[attempts-1]`. Once the
   * schedule is exhausted, or the error is non-transient, dead-letter.
   */
  private handleFailure(post: OutboxPost, err: unknown): PublishOutcome {
    const message = errorMessage(err);
    const attempt = post.attempts;
    // A missing publisher is a permanent configuration error — waiting won't fix
    // it, so dead-letter immediately rather than burning the backoff schedule.
    const permanent = err instanceof NoPublisherError;
    const canRetry = !permanent && this.isTransient(err) && attempt <= this.schedule.length;

    if (canRetry) {
      const delay = this.schedule[attempt - 1] ?? this.schedule[this.schedule.length - 1] ?? 0;
      const publishAt = this.now() + delay;
      const updated = this.repo.requeueForRetry(post.id, publishAt, message);
      this.logger?.info?.("outbox post re-queued for retry", {
        id: post.id,
        platform: post.platform,
        attempts: attempt,
        publishAt,
        error: message
      });
      this.emit?.("outbox:retry", {
        id: updated.id,
        platform: updated.platform,
        attempts: updated.attempts,
        publishAt: updated.publishAt,
        lastError: updated.lastError
      });
      return "requeued";
    }

    const entry = this.dlq.land({
      platform: post.platform,
      opKind: "outbox.publish",
      payload: { outboxId: post.id, platform: post.platform, accountId: post.accountId },
      lastError: message,
      attempts: attempt
    });
    const updated = this.repo.markFailed(post.id, message, attempt);
    this.logger?.error?.("outbox post dead-lettered", {
      id: post.id,
      platform: post.platform,
      attempts: attempt,
      dlqId: entry.id,
      error: message
    });
    this.emit?.("outbox:failed", {
      id: updated.id,
      platform: updated.platform,
      attempts: updated.attempts,
      lastError: updated.lastError,
      dlqId: entry.id
    });
    return "failed";
  }
}
