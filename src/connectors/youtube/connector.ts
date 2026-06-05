/**
 * YouTube connector factory (epic #58).
 *
 * Wraps comment-list reads and comment-reply writes with quota accounting:
 *   - Every list/read call records {@link READ_COST} via `recordFn`.
 *   - Every insert/reply call records {@link WRITE_COST} via `recordFn`.
 *   - If recording the cost would exceed the daily ceiling, the job is
 *     enqueued in the outbox for the next UTC midnight instead of dispatching.
 *   - After each successful record, {@link maybeSendQuotaAlert} is called to
 *     fire a one-time Telegram notification when usage crosses 80 %.
 *
 * `recordFn` is injectable so tests can spy on it without touching the DB.
 * The real production default is `recordQuotaUsage(db, units)`.
 */
import type { Database } from "better-sqlite3";

import type { OutboxRepository } from "../../outbox/repository.js";
import {
  READ_COST,
  WRITE_COST,
  isQuotaExhausted,
  maybeSendQuotaAlert,
  recordQuotaUsage,
  type QuotaAlertNotifier
} from "./quota.js";

// ─────────────────────────────── helpers ─────────────────────────────────────

/** Returns the epoch-ms timestamp of midnight at the START of the next UTC day. */
export function nextUtcMidnight(now = new Date()): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next;
}

// ─────────────────────────────── types ───────────────────────────────────────

export interface YoutubeConnectorOptions {
  db: Database;
  outbox: OutboxRepository;
  /**
   * Override the quota-recording function.  Defaults to calling
   * `recordQuotaUsage(db, units)` — override in tests to spy without a DB.
   */
  recordFn?: (units: number) => void;
  /** Telegram notifier for quota alerts.  Omit / null to suppress. */
  alertNotifier?: QuotaAlertNotifier | null;
  /** Injectable clock for deterministic tests. Defaults to `() => new Date()`. */
  now?: () => Date;
}

export interface YoutubeDispatchResult {
  queued: false;
}

export interface YoutubeQueuedResult {
  queued: true;
  /** ISO-8601 timestamp of next UTC midnight (when the job will be retried). */
  scheduledFor: string;
}

export type YoutubeResult = YoutubeDispatchResult | YoutubeQueuedResult;

// ─────────────────────────────── factory ─────────────────────────────────────

/**
 * Create a YouTube connector bound to the given options.
 *
 * Returns an object with two methods:
 *  - `fetchComments(videoId)` — costs {@link READ_COST} quota units.
 *  - `replyToComment(commentId, text)` — costs {@link WRITE_COST} quota units.
 *
 * Both methods return a {@link YoutubeResult} discriminated union:
 *   `{ queued: false }` — dispatched normally and quota recorded.
 *   `{ queued: true, scheduledFor }` — quota exhausted; job enqueued for retry.
 */
export function createYoutubeConnector(opts: YoutubeConnectorOptions) {
  const { db, outbox } = opts;
  const record = opts.recordFn ?? ((units: number) => recordQuotaUsage(db, units));
  const getNow = opts.now ?? (() => new Date());

  async function dispatch(
    cost: number,
    action: string,
    payload: Record<string, unknown>
  ): Promise<YoutubeResult> {
    const now = getNow();
    // Derive the UTC day from the injected clock so tests with a fixed `now`
    // are consistent with the quota rows they pre-seed for that specific date.
    const dayUtc = now.toISOString().slice(0, 10);

    if (isQuotaExhausted(db, cost, dayUtc)) {
      const midnight = nextUtcMidnight(now);
      outbox.create({
        platform: "youtube",
        body: JSON.stringify({ action, ...payload }),
        publishAt: midnight.getTime()
      });
      return { queued: true, scheduledFor: midnight.toISOString() };
    }

    // Not exhausted — record usage against the same day, then check alert.
    record(cost);
    await maybeSendQuotaAlert(db, opts.alertNotifier ?? null, dayUtc);

    return { queued: false };
  }

  return {
    /**
     * Fetch comments for a video.  Records {@link READ_COST} quota units.
     * Enqueues and returns `queued: true` when the daily budget is exhausted.
     */
    fetchComments(videoId: string): Promise<YoutubeResult> {
      return dispatch(READ_COST, "fetchComments", { videoId });
    },

    /**
     * Reply to a comment.  Records {@link WRITE_COST} quota units.
     * Enqueues and returns `queued: true` when the daily budget is exhausted.
     */
    replyToComment(commentId: string, text: string): Promise<YoutubeResult> {
      return dispatch(WRITE_COST, "replyToComment", { commentId, text });
    }
  };
}
