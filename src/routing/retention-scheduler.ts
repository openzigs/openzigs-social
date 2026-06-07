/**
 * Auto-reply audit retention cron driver (#163).
 *
 * The `auto_reply_audit` table (migration 0008) is append-only and is written
 * for *every* decision — even when the Hybrid posture is disabled — so it grows
 * unbounded without a prune path. This thin node-cron wrapper mirrors the
 * OutboxScheduler / analytics scheduler contract exactly: injectable cron
 * factory (so tests never leave real timers running), idempotent start/stop,
 * and an overlap guard so a slow prune never stacks on itself. The actual
 * delete logic lives in {@link AutoReplyAuditRepository.prune}.
 */
import cron from "node-cron";

import type { AuditPruneInput } from "./audit-repository.js";

/** Milliseconds in one day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Minimal structured logger (matches the rest of the codebase). */
export interface RetentionLogger {
  info?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
}

/** Minimal cron task contract. */
export interface CronTask {
  stop: () => void;
}

/** Injectable cron factory; defaults to node-cron. */
export type CronScheduleFn = (expression: string, handler: () => void) => CronTask;

const defaultSchedule: CronScheduleFn = (expression, handler) => cron.schedule(expression, handler);

/** The slice of the audit repository the prune job needs. */
export interface PrunableAuditRepository {
  prune(input: AuditPruneInput): number;
}

/**
 * Translate a retention policy (age in days + row cap) into the concrete prune
 * bounds for a given clock reading. A non-positive `maxAgeDays` disables the
 * age window; a non-positive `maxRows` disables the cap. Pure + exported for
 * direct unit testing.
 */
export function retentionBounds(deps: {
  now: number;
  maxAgeDays: number;
  maxRows: number;
}): AuditPruneInput {
  const bounds: AuditPruneInput = {};
  if (Number.isFinite(deps.maxAgeDays) && deps.maxAgeDays > 0) {
    bounds.olderThan = deps.now - deps.maxAgeDays * DAY_MS;
  }
  if (Number.isFinite(deps.maxRows) && deps.maxRows > 0) {
    bounds.maxRows = Math.floor(deps.maxRows);
  }
  return bounds;
}

export interface AutoReplyRetentionSchedulerDeps {
  audit: PrunableAuditRepository;
  cronExpression: string;
  /** Delete rows older than this many days (0 disables the age window). */
  maxAgeDays: number;
  /** Cap the table at this many newest rows (0 disables the cap). */
  maxRows: number;
  now?: () => number;
  schedule?: CronScheduleFn;
  logger?: RetentionLogger;
}

/** node-cron driver for the auto-reply audit retention prune (#163). */
export class AutoReplyRetentionScheduler {
  private readonly audit: PrunableAuditRepository;
  private readonly cronExpression: string;
  private readonly maxAgeDays: number;
  private readonly maxRows: number;
  private readonly now: () => number;
  private readonly scheduleFn: CronScheduleFn;
  private readonly logger?: RetentionLogger;
  private task: CronTask | undefined;
  private running = false;

  constructor(deps: AutoReplyRetentionSchedulerDeps) {
    this.audit = deps.audit;
    this.cronExpression = deps.cronExpression;
    this.maxAgeDays = deps.maxAgeDays;
    this.maxRows = deps.maxRows;
    this.now = deps.now ?? Date.now;
    this.scheduleFn = deps.schedule ?? defaultSchedule;
    this.logger = deps.logger;
    if (!cron.validate(this.cronExpression)) {
      throw new Error(`invalid auto-reply retention cron expression: ${this.cronExpression}`);
    }
  }

  /** Start the recurring prune. Idempotent. */
  start(): void {
    if (this.task) return;
    this.task = this.scheduleFn(this.cronExpression, () => {
      void this.runTick();
    });
    this.logger?.info?.("auto-reply retention scheduler started", {
      cron: this.cronExpression,
      maxAgeDays: this.maxAgeDays,
      maxRows: this.maxRows
    });
  }

  /** Stop the recurring prune. Idempotent. */
  stop(): void {
    this.task?.stop();
    this.task = undefined;
    this.logger?.info?.("auto-reply retention scheduler stopped");
  }

  /** Run one prune pass, guarding against overlapping executions. */
  async runTick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const bounds = retentionBounds({
        now: this.now(),
        maxAgeDays: this.maxAgeDays,
        maxRows: this.maxRows
      });
      const deleted = this.audit.prune(bounds);
      if (deleted > 0) {
        this.logger?.info?.("auto-reply audit pruned", { deleted });
      }
    } catch (err) {
      this.logger?.error?.("auto-reply audit prune failed", {
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      this.running = false;
    }
  }
}
