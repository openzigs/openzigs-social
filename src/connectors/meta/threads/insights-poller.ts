/**
 * Threads insights poller (#137).
 *
 * One poll pass reads media-level insight metrics
 * (`GET /{media-id}/insights?metric=views,likes,replies,reposts,quotes`) and
 * lands each reading in the shared {@link InsightsRepository} (#96), keyed for
 * idempotent re-polling. Reads flow through {@link MetaDispatcher} for the
 * shared Meta rate-limit budget; the scheduler drives cadence.
 */
import type { MetaDispatcher } from "../dispatcher.js";
import type { MetaGraphClient } from "../graph-client.js";
import type { InsightsRepository } from "../insights/repository.js";
import type { ThreadsAccount } from "./publisher.js";

/** Default Threads media metrics worth tracking. */
export const DEFAULT_THREADS_METRICS = ["views", "likes", "replies", "reposts", "quotes"] as const;

interface GraphList<T> {
  data?: T[];
}

interface ThreadsInsightMetric {
  name?: string;
  values?: Array<{ value?: number; end_time?: string }>;
}

export interface ThreadsInsightsPollerDeps {
  client: MetaGraphClient;
  insights: InsightsRepository;
  dispatcher: MetaDispatcher;
  /** Rate-limit budget key. Default `"meta"`. */
  platform?: string;
  /** Metrics to request. Default {@link DEFAULT_THREADS_METRICS}. */
  metrics?: readonly string[];
}

export interface ThreadsInsightsPollResult {
  metrics: number;
}

export class ThreadsInsightsPoller {
  private readonly client: MetaGraphClient;
  private readonly insights: InsightsRepository;
  private readonly dispatcher: MetaDispatcher;
  private readonly platform: string;
  private readonly metrics: readonly string[];

  constructor(deps: ThreadsInsightsPollerDeps) {
    this.client = deps.client;
    this.insights = deps.insights;
    this.dispatcher = deps.dispatcher;
    this.platform = deps.platform ?? "meta";
    this.metrics = deps.metrics ?? DEFAULT_THREADS_METRICS;
  }

  /** Pull insight metrics for a Threads media id into the insights store. */
  async poll(account: ThreadsAccount, mediaId: string): Promise<ThreadsInsightsPollResult> {
    const res = await this.run<GraphList<ThreadsInsightMetric>>(() =>
      this.client.get<GraphList<ThreadsInsightMetric>>(`/${mediaId}/insights`, {
        accessToken: account.accessToken,
        query: { metric: this.metrics.join(",") }
      })
    );

    let recorded = 0;
    for (const metric of res.data ?? []) {
      if (!metric.name) continue;
      const latest = metric.values?.[metric.values.length - 1];
      this.insights.record({
        platform: "threads",
        objectType: "media",
        objectId: mediaId,
        metric: metric.name,
        value: typeof latest?.value === "number" ? latest.value : null,
        capturedFor: latest?.end_time ?? "lifetime"
      });
      recorded += 1;
    }
    return { metrics: recorded };
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    const outcome = await this.dispatcher.dispatch<T>(
      { platform: this.platform, opKind: "threads.poll.insights", payload: {} },
      fn
    );
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }
}
