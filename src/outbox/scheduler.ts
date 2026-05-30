/**
 * Outbox scheduler (#86) — node-cron driver for the {@link OutboxPoller}.
 *
 * Runs `poller.tick()` on a cron cadence (default every 30s, well inside the
 * 60s publish-latency AC). Two safety properties:
 *
 *   1. Non-overlap: if a tick is still in flight when the next fires, the new
 *      tick is skipped (a boolean guard). Combined with the repository's atomic
 *      claim this makes double-publish impossible.
 *   2. Testability: the cron factory is injectable, so tests pass a fake that
 *      hands back a controllable task and the suite exits cleanly — no real
 *      cron timers are left running.
 */
import cron from "node-cron";
import type { OutboxLogger, OutboxPoller } from "./poller.js";

/** Default cadence: every 30 seconds (6-field cron with seconds). */
export const DEFAULT_OUTBOX_CRON = "*/30 * * * * *";

/** Minimal contract a scheduled cron task must satisfy. */
export interface CronTask {
  stop: () => void;
}

/** Factory that registers a recurring task; defaults to node-cron. */
export type CronScheduleFn = (expression: string, handler: () => void) => CronTask;

export interface OutboxSchedulerDeps {
  poller: OutboxPoller;
  /** Cron expression. Default {@link DEFAULT_OUTBOX_CRON}. */
  cronExpression?: string;
  /** Injectable cron factory (tests pass a fake). Default: node-cron. */
  schedule?: CronScheduleFn;
  logger?: OutboxLogger;
}

const defaultSchedule: CronScheduleFn = (expression, handler) => cron.schedule(expression, handler);

export class OutboxScheduler {
  private readonly poller: OutboxPoller;
  private readonly cronExpression: string;
  private readonly scheduleFn: CronScheduleFn;
  private readonly logger?: OutboxLogger;
  private task: CronTask | undefined;
  private running = false;

  constructor(deps: OutboxSchedulerDeps) {
    this.poller = deps.poller;
    this.cronExpression = deps.cronExpression ?? DEFAULT_OUTBOX_CRON;
    this.scheduleFn = deps.schedule ?? defaultSchedule;
    this.logger = deps.logger;
    if (!cron.validate(this.cronExpression)) {
      throw new Error(`invalid outbox cron expression: ${this.cronExpression}`);
    }
  }

  /** Start the recurring poll. Idempotent. */
  start(): void {
    if (this.task) return;
    this.task = this.scheduleFn(this.cronExpression, () => {
      void this.runTick();
    });
    this.logger?.info?.("outbox scheduler started", { cron: this.cronExpression });
  }

  /** Stop the recurring poll. Idempotent. */
  stop(): void {
    this.task?.stop();
    this.task = undefined;
    this.logger?.info?.("outbox scheduler stopped");
  }

  /** Run one tick, guarding against overlapping executions. */
  async runTick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.poller.tick();
      if (result.claimed > 0) {
        this.logger?.info?.("outbox tick", { ...result });
      }
    } catch (err) {
      this.logger?.error?.("outbox tick failed", {
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      this.running = false;
    }
  }
}
