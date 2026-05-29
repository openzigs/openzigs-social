/**
 * LinkedIn analytics poller (#62).
 *
 * Periodically pulls organization follower deltas and post-level engagement
 * into the shared analytics store, reusing the {@link InsightsRepository}
 * (`platform_insights_raw`, migration `0003`) rather than introducing a new
 * table. Each reading is idempotent on
 * `(platform, object_type, object_id, metric, captured_for)`, so re-polling the
 * same window updates in place.
 *
 *   - **Follower deltas** — `GET /rest/networkSizes/{orgUrn}?edgeType=...` style
 *     follower count, stored as `objectType="account"`, `metric="followers"`.
 *   - **Post insights** — `GET /rest/socialActions/{postUrn}` like/comment
 *     counts, stored as `objectType="post"` with `likes` / `comments` metrics.
 *
 * Reads share the LinkedIn rate-limit budget via {@link LinkedInDispatcher}.
 */
import type { LinkedInDispatcher } from "./dispatcher.js";
import type { InsightsRepository } from "../meta/insights/repository.js";
import type { LinkedInRestClient } from "./rest-client.js";

const PLATFORM = "linkedin";

interface FollowerCountResponse {
  firstDegreeSize?: number;
}

interface SocialActionSummary {
  likesSummary?: { totalLikes?: number };
  commentsSummary?: { aggregatedTotalComments?: number };
}

export interface LinkedInAnalyticsPollerDeps {
  client: LinkedInRestClient;
  insights: InsightsRepository;
  dispatcher: LinkedInDispatcher;
  /** Rate-limit budget key. Default `"linkedin"`. */
  platform?: string;
  /** Capture window key; defaults to the current UTC day. */
  now?: () => Date;
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class LinkedInAnalyticsPoller {
  private readonly client: LinkedInRestClient;
  private readonly insights: InsightsRepository;
  private readonly dispatcher: LinkedInDispatcher;
  private readonly platform: string;
  private readonly now: () => Date;

  constructor(deps: LinkedInAnalyticsPollerDeps) {
    this.client = deps.client;
    this.insights = deps.insights;
    this.dispatcher = deps.dispatcher;
    this.platform = deps.platform ?? "linkedin";
    this.now = deps.now ?? (() => new Date());
  }

  /** Record the current follower count for an organization URN. */
  async pollFollowers(accessToken: string, orgUrn: string): Promise<number | undefined> {
    const encoded = encodeURIComponent(orgUrn);
    const res = await this.run<FollowerCountResponse>("linkedin.poll.followers", () =>
      this.client.get<FollowerCountResponse>(
        `/networkSizes/${encoded}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`,
        {
          accessToken
        }
      )
    );
    if (typeof res.firstDegreeSize !== "number") return undefined;
    this.insights.record({
      platform: PLATFORM,
      objectType: "account",
      objectId: orgUrn,
      metric: "followers",
      value: res.firstDegreeSize,
      capturedFor: utcDay(this.now())
    });
    return res.firstDegreeSize;
  }

  /** Record like/comment engagement for a post URN. */
  async pollPostInsights(accessToken: string, postUrn: string): Promise<void> {
    const encoded = encodeURIComponent(postUrn);
    const res = await this.run<SocialActionSummary>("linkedin.poll.post", () =>
      this.client.get<SocialActionSummary>(`/socialActions/${encoded}`, { accessToken })
    );
    const capturedFor = utcDay(this.now());
    this.insights.recordMany([
      {
        platform: PLATFORM,
        objectType: "post",
        objectId: postUrn,
        metric: "likes",
        value: res.likesSummary?.totalLikes ?? 0,
        capturedFor
      },
      {
        platform: PLATFORM,
        objectType: "post",
        objectId: postUrn,
        metric: "comments",
        value: res.commentsSummary?.aggregatedTotalComments ?? 0,
        capturedFor
      }
    ]);
  }

  private async run<T>(opKind: string, fn: () => Promise<T>): Promise<T> {
    const outcome = await this.dispatcher.dispatch<T>(
      { platform: this.platform, opKind, payload: {} },
      fn
    );
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }
}
