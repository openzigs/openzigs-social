/**
 * X (Twitter) write-quota guard — Cohort C (#66, sub #70).
 *
 * Wraps the {@link TwitterCreditTracker} with the *policy* the epic requires:
 *
 *   - **Hard block at 100%** — {@link ensureWithinQuota} throws
 *     {@link TwitterQuotaExceededError} once month-to-date usage reaches the
 *     tier cap, so the publisher/DM sender refuse further writes rather than
 *     letting X reject them (and burning a real attempt).
 *   - **Warn at the threshold** (default 80%) — after each recorded write the
 *     guard re-evaluates utilisation and, on the *first* crossing of the warn
 *     or block line in a given month, emits a `twitter:quota` socket event (for
 *     the model panel) and fires the optional Telegram alert sink. Warnings are
 *     **edge-triggered per month** so the user is not spammed every write.
 *
 * Emission/alert seams are injected so tests assert on them without a real
 * socket or bot, and the month bucket comes from the tracker so everything
 * resets together at roll-over.
 */
import type { CreditSummary, RecordCreditInput, TwitterCreditTracker } from "./credit-tracker.js";

/** Severity of a quota state change. */
export type QuotaLevel = "warning" | "exceeded";

/** Payload for the `twitter:quota` socket event + the alert sink. */
export interface QuotaEvent {
  level: QuotaLevel;
  summary: CreditSummary;
}

/** Socket-style emitter, e.g. `io.emit`. */
export type QuotaEmit = (event: "twitter:quota", payload: QuotaEvent) => void;

/** Telegram (or any) alert sink. May be async; failures are swallowed. */
export type QuotaAlertSink = (text: string) => void | Promise<void>;

/** Thrown when a write is attempted after the monthly cap is reached. */
export class TwitterQuotaExceededError extends Error {
  readonly summary: CreditSummary;
  constructor(summary: CreditSummary) {
    super(
      `x write quota exhausted: ${summary.used}/${summary.cap} for ${summary.month} (tier cap reached)`
    );
    this.name = "TwitterQuotaExceededError";
    this.summary = summary;
  }
}

export interface TwitterQuotaGuardDeps {
  tracker: TwitterCreditTracker;
  /** Active tier monthly write cap. */
  cap: number;
  /** Utilisation ratio in (0,1] at which to warn. Default 0.8. */
  warnThreshold?: number;
  /** Socket emitter for `twitter:quota`. Optional. */
  emit?: QuotaEmit;
  /** Telegram alert sink. Optional. */
  alert?: QuotaAlertSink;
}

export class TwitterQuotaGuard {
  private readonly tracker: TwitterCreditTracker;
  private readonly cap: number;
  private readonly warnThreshold: number;
  private readonly emit?: QuotaEmit;
  private readonly alert?: QuotaAlertSink;
  /** Months we have already emitted a `warning` for (edge-trigger). */
  private readonly warned = new Set<string>();
  /** Months we have already emitted an `exceeded` for (edge-trigger). */
  private readonly blocked = new Set<string>();

  constructor(deps: TwitterQuotaGuardDeps) {
    this.tracker = deps.tracker;
    this.cap = deps.cap;
    this.warnThreshold = deps.warnThreshold ?? 0.8;
    if (deps.emit) this.emit = deps.emit;
    if (deps.alert) this.alert = deps.alert;
  }

  /** Current month-to-date usage summary against the tier cap. */
  status(): CreditSummary {
    return this.tracker.summary(this.cap);
  }

  /**
   * Throw {@link TwitterQuotaExceededError} when the monthly cap is already
   * reached. Call this BEFORE attempting a billable write.
   */
  ensureWithinQuota(): void {
    const summary = this.status();
    if (summary.used >= summary.cap) {
      this.fire("exceeded", summary);
      throw new TwitterQuotaExceededError(summary);
    }
  }

  /**
   * Record a successful billable write, then re-evaluate utilisation and emit a
   * warning/exceeded event on the first crossing this month. Returns the fresh
   * summary.
   */
  recordWrite(input: RecordCreditInput): CreditSummary {
    this.tracker.record(input);
    const summary = this.status();
    if (summary.ratio >= 1 || summary.used >= summary.cap) {
      this.fire("exceeded", summary);
    } else if (summary.ratio >= this.warnThreshold) {
      this.fire("warning", summary);
    }
    return summary;
  }

  /** Emit + alert once per (level, month). */
  private fire(level: QuotaLevel, summary: CreditSummary): void {
    const seen = level === "exceeded" ? this.blocked : this.warned;
    if (seen.has(summary.month)) return;
    seen.add(summary.month);
    this.emit?.("twitter:quota", { level, summary });
    if (this.alert) {
      const pct = Math.round(summary.ratio * 100);
      const text =
        level === "exceeded"
          ? `🛑 X write quota exhausted (${summary.used}/${summary.cap} for ${summary.month}). New posts/replies/DMs are blocked until next month.`
          : `⚠️ X write quota at ${pct}% (${summary.used}/${summary.cap} for ${summary.month}).`;
      void Promise.resolve(this.alert(text)).catch(() => undefined);
    }
  }
}
