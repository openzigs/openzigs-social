/**
 * Minimal in-memory metrics counter.
 *
 * Tracks `sent` / `received` / `failed` per platform. Emits `update` whenever
 * a counter changes so the server can push a Socket.IO `metrics:update`.
 * Intentionally process-local and ephemeral — not a Prometheus replacement.
 */
import { EventEmitter } from "node:events";

export type MetricKind = "sent" | "received" | "failed";

export interface PlatformCounters {
  sent: number;
  received: number;
  failed: number;
}

export type MetricsSnapshot = Record<string, PlatformCounters>;

function zero(): PlatformCounters {
  return { sent: 0, received: 0, failed: 0 };
}

export class Metrics extends EventEmitter {
  private readonly counters = new Map<string, PlatformCounters>();

  /** Increment a platform counter by `by` (default 1) and emit `update`. */
  increment(platform: string, kind: MetricKind, by = 1): void {
    const current = this.counters.get(platform) ?? zero();
    current[kind] += by;
    this.counters.set(platform, current);
    this.emit("update", this.snapshot());
  }

  recordSent(platform: string, by = 1): void {
    this.increment(platform, "sent", by);
  }

  recordReceived(platform: string, by = 1): void {
    this.increment(platform, "received", by);
  }

  recordFailed(platform: string, by = 1): void {
    this.increment(platform, "failed", by);
  }

  /** Plain-object copy of all counters. */
  snapshot(): MetricsSnapshot {
    const out: MetricsSnapshot = {};
    for (const [platform, counters] of this.counters) {
      out[platform] = { ...counters };
    }
    return out;
  }

  /** Reset all counters (does not emit). */
  reset(): void {
    this.counters.clear();
  }
}

/** Process-wide metrics instance. */
export const metrics = new Metrics();
