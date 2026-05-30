/**
 * X (Twitter) write-quota credit tracker — Cohort C (#66, sub #69).
 *
 * X meters paid *write* actions (create tweet, reply, send DM) against a
 * monthly per-tier budget. Short-window rate limits are the
 * {@link RateLimitBroker}'s job; this is the slow, monthly-resetting credit
 * pool. Every billable write is recorded in `twitter_credit_usage` (migration
 * `0004`) keyed on a connector-supplied dedupe key, so a retry or re-poll never
 * double-counts. The {@link summary} method reports month-to-date consumption
 * against the active tier cap for the quota guard (#70) and the model panel.
 *
 * `usageMonth` is the UTC `YYYY-MM` bucket the write counts against, so the pool
 * resets naturally at month roll-over — no cron, no reset job.
 */
import type { Database, Statement } from "better-sqlite3";

/** A billable X write action kind. */
export type TwitterCreditKind = "tweet" | "reply" | "dm";

export interface RecordCreditInput {
  /** Action kind. */
  kind: TwitterCreditKind;
  /** Connector-supplied idempotency key (tweet/DM id or client token). */
  dedupeKey: string;
  /** Credits consumed. Default 1. */
  amount?: number;
  /** UTC month bucket `YYYY-MM`. Defaults to the current month. */
  month?: string;
  /** Optional non-secret metadata stored as JSON. */
  metadata?: Record<string, unknown>;
}

/** Month-to-date usage summary against a cap. */
export interface CreditSummary {
  /** UTC month bucket the summary describes. */
  month: string;
  /** Credits used so far this month. */
  used: number;
  /** The tier write-quota cap for the month. */
  cap: number;
  /** Credits remaining (never negative). */
  remaining: number;
  /** Utilisation in [0, 1] (clamped; `used/cap`). */
  ratio: number;
}

/** UTC `YYYY-MM` bucket for a date. */
export function utcMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export interface TwitterCreditTrackerDeps {
  db: Database;
  /** Injectable clock for the default month bucket. */
  now?: () => Date;
}

export class TwitterCreditTracker {
  private readonly now: () => Date;
  private readonly stmts: {
    insert: Statement;
    sumMonth: Statement;
  };

  constructor(deps: TwitterCreditTrackerDeps) {
    this.now = deps.now ?? (() => new Date());
    this.stmts = {
      insert: deps.db.prepare(
        `INSERT OR IGNORE INTO twitter_credit_usage
           (usage_month, kind, amount, dedupe_key, metadata_json)
         VALUES (@usage_month, @kind, @amount, @dedupe_key, @metadata_json)`
      ),
      sumMonth: deps.db.prepare(
        `SELECT COALESCE(SUM(amount), 0) AS used
           FROM twitter_credit_usage
          WHERE usage_month = ?`
      )
    };
  }

  /**
   * Record a billable write. Idempotent on `dedupeKey` — a duplicate is a
   * no-op (returns `false`), so retries never inflate usage. Returns `true`
   * when a new row was inserted.
   */
  record(input: RecordCreditInput): boolean {
    const month = input.month ?? utcMonth(this.now());
    const result = this.stmts.insert.run({
      usage_month: month,
      kind: input.kind,
      amount: input.amount ?? 1,
      dedupe_key: input.dedupeKey,
      metadata_json: input.metadata ? JSON.stringify(input.metadata) : null
    });
    return result.changes > 0;
  }

  /** Month-to-date credits used for `month` (defaults to the current month). */
  usedThisMonth(month?: string): number {
    const bucket = month ?? utcMonth(this.now());
    const row = this.stmts.sumMonth.get(bucket) as { used: number };
    return row.used;
  }

  /** Summarise month-to-date usage against `cap`. */
  summary(cap: number, month?: string): CreditSummary {
    const bucket = month ?? utcMonth(this.now());
    const used = this.usedThisMonth(bucket);
    const remaining = Math.max(0, cap - used);
    const ratio = cap > 0 ? Math.min(1, used / cap) : 1;
    return { month: bucket, used, cap, remaining, ratio };
  }
}
