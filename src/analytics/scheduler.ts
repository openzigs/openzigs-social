/**
 * Analytics cron drivers (epic #95, sub-issues #96 and #99).
 *
 * Two node-cron schedulers that mirror the OutboxScheduler contract exactly:
 * injectable cron factory (so tests never leave real timers running), idempotent
 * start/stop, and an overlap guard so a slow run never stacks on itself. All the
 * actual maths lives in the pure modules — these are thin IO wrappers that read
 * from SQLite, call the pure functions, and persist/deliver the result.
 */
import cron from "node-cron";

import { rollupEngagement, utcDayKey } from "./aggregator.js";
import { composeWeeklyDigest } from "./digest.js";
import { bucketPublishTimes } from "./heatmap.js";
import type { AnalyticsCacheRepository } from "./repository.js";
import { topPosts } from "./top-posts.js";
import { ROLLUP_WINDOWS, type TopPost } from "./types.js";
import type { Mailer } from "./mailer.js";

/** Minimal structured logger (matches the rest of the codebase). */
export interface AnalyticsLogger {
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

/** Per-window cap for the persisted top-post leaderboard. */
const TOP_POSTS_PER_WINDOW = 10;

/**
 * Run one aggregation pass: read raw insights + published posts, compute the
 * rollups/heatmap/leaderboards, and persist the day's snapshot. Pure inputs in,
 * one transactional write out. Safe to call repeatedly (idempotent per day).
 */
export function runAggregation(deps: {
  repo: AnalyticsCacheRepository;
  timezone: string;
  now: number;
}): { capturedFor: string; platforms: number } {
  const { repo, timezone, now } = deps;
  const insights = repo.readInsightRows();
  const posts = repo.readPublishedPosts();

  const rollups = rollupEngagement({ insights, posts, now });
  const heatmap = bucketPublishTimes({ posts, timezone });
  const topPostsByWindow = new Map<number, readonly TopPost[]>();
  for (const windowDays of ROLLUP_WINDOWS) {
    topPostsByWindow.set(
      windowDays,
      topPosts({ insights, posts, now, windowDays, limit: TOP_POSTS_PER_WINDOW })
    );
  }

  const capturedFor = utcDayKey(now);
  repo.writeSnapshot({ capturedFor, rollups, heatmap, topPostsByWindow });

  const platforms = new Set(rollups.map((r) => r.platform)).size;
  return { capturedFor, platforms };
}

export interface AnalyticsAggregatorSchedulerDeps {
  repo: AnalyticsCacheRepository;
  timezone: string;
  cronExpression: string;
  now?: () => number;
  schedule?: CronScheduleFn;
  logger?: AnalyticsLogger;
  /** Optional socket sink; emits `analytics:updated` after each roll-up. */
  emit?: (event: string, payload: unknown) => void;
}

/** node-cron driver for the daily rollup aggregator (#96). */
export class AnalyticsAggregatorScheduler {
  private readonly repo: AnalyticsCacheRepository;
  private readonly timezone: string;
  private readonly cronExpression: string;
  private readonly now: () => number;
  private readonly scheduleFn: CronScheduleFn;
  private readonly logger?: AnalyticsLogger;
  private readonly emit?: (event: string, payload: unknown) => void;
  private task: CronTask | undefined;
  private running = false;

  constructor(deps: AnalyticsAggregatorSchedulerDeps) {
    this.repo = deps.repo;
    this.timezone = deps.timezone;
    this.cronExpression = deps.cronExpression;
    this.now = deps.now ?? Date.now;
    this.scheduleFn = deps.schedule ?? defaultSchedule;
    this.logger = deps.logger;
    this.emit = deps.emit;
    if (!cron.validate(this.cronExpression)) {
      throw new Error(`invalid analytics aggregator cron expression: ${this.cronExpression}`);
    }
  }

  start(): void {
    if (this.task) return;
    this.task = this.scheduleFn(this.cronExpression, () => {
      void this.runTick();
    });
    this.logger?.info?.("analytics aggregator started", { cron: this.cronExpression });
  }

  stop(): void {
    this.task?.stop();
    this.task = undefined;
    this.logger?.info?.("analytics aggregator stopped");
  }

  async runTick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = runAggregation({ repo: this.repo, timezone: this.timezone, now: this.now() });
      this.emit?.("analytics:updated", { capturedFor: result.capturedFor });
      this.logger?.info?.("analytics aggregated", { ...result });
    } catch (err) {
      this.logger?.error?.("analytics aggregation failed", {
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      this.running = false;
    }
  }
}

export interface RunDigestDeps {
  repo: AnalyticsCacheRepository;
  timezone: string;
  topLimit: number;
  now: number;
  /** Telegram broadcast (or any text sink). Omit to skip Telegram delivery. */
  notify?: (text: string) => Promise<void>;
  /** Optional SMTP mailer. Omit/`null` to skip email delivery. */
  mailer?: Mailer | null;
  logger?: AnalyticsLogger;
}

/**
 * Compose the weekly digest and deliver it over every configured channel.
 * Telegram and SMTP are independent and best-effort: a failure on one is logged
 * and never blocks the other (or crashes the cron).
 */
export async function runDigest(deps: RunDigestDeps): Promise<string> {
  const insights = deps.repo.readInsightRows();
  const posts = deps.repo.readPublishedPosts();
  const { markdown } = composeWeeklyDigest({
    insights,
    posts,
    now: deps.now,
    timezone: deps.timezone,
    topLimit: deps.topLimit
  });

  if (deps.notify) {
    try {
      await deps.notify(markdown);
    } catch (err) {
      deps.logger?.error?.("digest telegram delivery failed", {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  if (deps.mailer) {
    try {
      await deps.mailer.send("Weekly Analytics Digest", markdown);
    } catch (err) {
      deps.logger?.error?.("digest email delivery failed", {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return markdown;
}

export interface WeeklyDigestSchedulerDeps {
  repo: AnalyticsCacheRepository;
  timezone: string;
  topLimit: number;
  cronExpression: string;
  now?: () => number;
  notify?: (text: string) => Promise<void>;
  mailer?: Mailer | null;
  schedule?: CronScheduleFn;
  logger?: AnalyticsLogger;
}

/** node-cron driver for the weekly digest (#99). */
export class WeeklyDigestScheduler {
  private readonly deps: WeeklyDigestSchedulerDeps;
  private readonly cronExpression: string;
  private readonly now: () => number;
  private readonly scheduleFn: CronScheduleFn;
  private readonly logger?: AnalyticsLogger;
  private task: CronTask | undefined;
  private running = false;

  constructor(deps: WeeklyDigestSchedulerDeps) {
    this.deps = deps;
    this.cronExpression = deps.cronExpression;
    this.now = deps.now ?? Date.now;
    this.scheduleFn = deps.schedule ?? defaultSchedule;
    this.logger = deps.logger;
    if (!cron.validate(this.cronExpression)) {
      throw new Error(`invalid weekly digest cron expression: ${this.cronExpression}`);
    }
  }

  start(): void {
    if (this.task) return;
    this.task = this.scheduleFn(this.cronExpression, () => {
      void this.runTick();
    });
    this.logger?.info?.("weekly digest scheduler started", { cron: this.cronExpression });
  }

  stop(): void {
    this.task?.stop();
    this.task = undefined;
    this.logger?.info?.("weekly digest scheduler stopped");
  }

  async runTick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await runDigest({
        repo: this.deps.repo,
        timezone: this.deps.timezone,
        topLimit: this.deps.topLimit,
        now: this.now(),
        notify: this.deps.notify,
        mailer: this.deps.mailer,
        logger: this.logger
      });
      this.logger?.info?.("weekly digest sent");
    } catch (err) {
      this.logger?.error?.("weekly digest failed", {
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      this.running = false;
    }
  }
}
