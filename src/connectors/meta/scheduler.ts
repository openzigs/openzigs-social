/**
 * Meta polling scheduler.
 *
 * Webhooks (see `webhook-handler.ts`) are the realtime fast path; this
 * scheduler is the fallback that keeps the inbox, replies, and insights fresh
 * when webhooks are not configured or miss a delivery. It runs a set of named
 * poll tasks on a fixed cadence using an **injectable** timer pair
 * (`setTimer`/`clearTimer`) so fake timers fully drive the loop in tests — no
 * real `setInterval`, no wall-clock waits.
 *
 * Each tick is isolated: a task that throws is reported via `onError` and does
 * not stop the loop or sibling tasks. Overlapping runs are prevented per task.
 */
export type TimerHandle = ReturnType<typeof setTimeout>;

export interface SchedulerTask {
  /** Stable name for logging/metrics. */
  name: string;
  /** Interval between runs, in milliseconds. */
  intervalMs: number;
  /** One poll pass. */
  run: () => Promise<void>;
}

export interface MetaSchedulerOptions {
  tasks: SchedulerTask[];
  /** Schedule a one-shot timer. Defaults to `setTimeout`. */
  setTimer?: (fn: () => void, ms: number) => TimerHandle;
  /** Cancel a scheduled timer. Defaults to `clearTimeout`. */
  clearTimer?: (handle: TimerHandle) => void;
  /** Reports an error thrown by a task's `run`. */
  onError?: (taskName: string, error: unknown) => void;
}

export class MetaScheduler {
  private readonly tasks: SchedulerTask[];
  private readonly setTimer: (fn: () => void, ms: number) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;
  private readonly onError?: (taskName: string, error: unknown) => void;
  private readonly handles = new Map<string, TimerHandle>();
  private readonly inFlight = new Set<string>();
  private running = false;

  constructor(opts: MetaSchedulerOptions) {
    this.tasks = opts.tasks;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h));
    this.onError = opts.onError;
  }

  /** Start every task's recurring timer. Idempotent. */
  start(): void {
    if (this.running) return;
    this.running = true;
    for (const task of this.tasks) {
      this.schedule(task);
    }
  }

  /** Cancel all pending timers. Tasks already mid-run finish on their own. */
  stop(): void {
    this.running = false;
    for (const handle of this.handles.values()) {
      this.clearTimer(handle);
    }
    this.handles.clear();
  }

  private schedule(task: SchedulerTask): void {
    if (!this.running) return;
    const handle = this.setTimer(() => {
      void this.tick(task);
    }, task.intervalMs);
    this.handles.set(task.name, handle);
  }

  private async tick(task: SchedulerTask): Promise<void> {
    if (this.inFlight.has(task.name)) {
      // Previous run still going; reschedule and skip.
      this.schedule(task);
      return;
    }
    this.inFlight.add(task.name);
    try {
      await task.run();
    } catch (error) {
      this.onError?.(task.name, error);
    } finally {
      this.inFlight.delete(task.name);
      this.schedule(task);
    }
  }
}
