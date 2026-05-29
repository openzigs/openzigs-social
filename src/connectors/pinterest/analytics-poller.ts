/**
 * Pinterest analytics poller (#63).
 *
 * Pulls pin-level analytics via `GET /pins/{pin_id}/analytics` into the shared
 * analytics store, reusing the {@link InsightsRepository} (`platform_insights_raw`,
 * migration `0003`) rather than a new table. Each metric is idempotent on
 * `(platform, object_type, object_id, metric, captured_for)`.
 *
 * Pinterest returns a per-metric daily series under
 * `all.daily_metrics[].data_status` + `metrics`; this poller records the
 * summary metrics keyed by the requested capture window. Reads share the
 * Pinterest rate-limit budget via {@link PinterestDispatcher}.
 */
import type { PinterestDispatcher } from "./dispatcher.js";
import type { InsightsRepository } from "../meta/insights/repository.js";
import type { PinterestRestClient } from "./rest-client.js";

const PLATFORM = "pinterest";

/** Pinterest pin analytics response (subset we rely on). */
interface PinAnalyticsResponse {
  all?: {
    summary_metrics?: Record<string, number>;
  };
}

export interface PinterestAnalyticsPollerDeps {
  client: PinterestRestClient;
  insights: InsightsRepository;
  dispatcher: PinterestDispatcher;
  platform?: string;
  now?: () => Date;
}

/** Metric types requested by default (Pinterest API metric_types). */
export const PINTEREST_DEFAULT_METRICS = ["IMPRESSION", "PIN_CLICK", "SAVE"] as const;

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class PinterestAnalyticsPoller {
  private readonly client: PinterestRestClient;
  private readonly insights: InsightsRepository;
  private readonly dispatcher: PinterestDispatcher;
  private readonly platform: string;
  private readonly now: () => Date;

  constructor(deps: PinterestAnalyticsPollerDeps) {
    this.client = deps.client;
    this.insights = deps.insights;
    this.dispatcher = deps.dispatcher;
    this.platform = deps.platform ?? "pinterest";
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Record analytics for a pin. `startDate`/`endDate` are `YYYY-MM-DD` strings
   * (required by the Pinterest API); when omitted both default to today.
   */
  async pollPin(
    accessToken: string,
    pinId: string,
    opts: { startDate?: string; endDate?: string; metricTypes?: readonly string[] } = {}
  ): Promise<number> {
    const today = utcDay(this.now());
    const metricTypes = (opts.metricTypes ?? PINTEREST_DEFAULT_METRICS).join(",");
    const res = await this.run<PinAnalyticsResponse>(() =>
      this.client.get<PinAnalyticsResponse>(`/pins/${encodeURIComponent(pinId)}/analytics`, {
        accessToken,
        query: {
          start_date: opts.startDate ?? today,
          end_date: opts.endDate ?? today,
          metric_types: metricTypes
        }
      })
    );

    const summary = res.all?.summary_metrics ?? {};
    const capturedFor = opts.endDate ?? today;
    const readings = Object.entries(summary).map(([metric, value]) => ({
      platform: PLATFORM,
      objectType: "pin",
      objectId: pinId,
      metric: metric.toLowerCase(),
      value,
      capturedFor
    }));
    this.insights.recordMany(readings);
    return readings.length;
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    const outcome = await this.dispatcher.dispatch<T>(
      { platform: this.platform, opKind: "pinterest.poll.pin", payload: {} },
      fn
    );
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }
}
