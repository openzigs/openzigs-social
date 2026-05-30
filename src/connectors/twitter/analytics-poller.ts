/**
 * X (Twitter) analytics poller — Cohort C (#66, sub #68).
 *
 * Periodically pulls account follower counts and per-tweet public metrics into
 * the shared analytics store, reusing the {@link InsightsRepository}
 * (`platform_insights_raw`, migration `0003`) rather than introducing a new
 * table. Each reading is idempotent on
 * `(platform, object_type, object_id, metric, captured_for)`, so re-polling the
 * same window updates in place.
 *
 *   - **Followers** — `GET /users/:id?user.fields=public_metrics`, stored as
 *     `objectType="account"`, `metric="followers"`.
 *   - **Tweet metrics** — `GET /tweets/:id?tweet.fields=public_metrics`,
 *     stored as `objectType="tweet"` with like/retweet/reply/quote/impression
 *     metrics.
 *
 * Reads share the X rate-limit budget via {@link TwitterDispatcher}.
 */
import type { InsightsRepository } from "../meta/insights/repository.js";
import type { TwitterDispatcher } from "./dispatcher.js";
import type { TwitterRestClient } from "./rest-client.js";

const PLATFORM = "twitter";

interface UserPublicMetrics {
  followers_count?: number;
  following_count?: number;
  tweet_count?: number;
}

interface UserResponse {
  data?: { id?: string; public_metrics?: UserPublicMetrics };
}

interface TweetPublicMetrics {
  retweet_count?: number;
  reply_count?: number;
  like_count?: number;
  quote_count?: number;
  impression_count?: number;
}

interface TweetResponse {
  data?: { id?: string; public_metrics?: TweetPublicMetrics };
}

export interface TwitterAnalyticsPollerDeps {
  client: TwitterRestClient;
  insights: InsightsRepository;
  dispatcher: TwitterDispatcher;
  /** Rate-limit budget key. Default `"twitter"`. */
  platform?: string;
  /** Capture window key; defaults to the current UTC day. */
  now?: () => Date;
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class TwitterAnalyticsPoller {
  private readonly client: TwitterRestClient;
  private readonly insights: InsightsRepository;
  private readonly dispatcher: TwitterDispatcher;
  private readonly platform: string;
  private readonly now: () => Date;

  constructor(deps: TwitterAnalyticsPollerDeps) {
    this.client = deps.client;
    this.insights = deps.insights;
    this.dispatcher = deps.dispatcher;
    this.platform = deps.platform ?? PLATFORM;
    this.now = deps.now ?? (() => new Date());
  }

  /** Record the current follower count for a user id. */
  async pollFollowers(accessToken: string, userId: string): Promise<number | undefined> {
    const res = await this.run<UserResponse>("twitter.poll.followers", () =>
      this.client.get<UserResponse>(`/users/${encodeURIComponent(userId)}`, {
        accessToken,
        query: { "user.fields": "public_metrics" }
      })
    );
    const followers = res.data?.public_metrics?.followers_count;
    if (typeof followers !== "number") return undefined;
    this.insights.record({
      platform: PLATFORM,
      objectType: "account",
      objectId: userId,
      metric: "followers",
      value: followers,
      capturedFor: utcDay(this.now())
    });
    return followers;
  }

  /** Record public engagement metrics for a tweet id. */
  async pollTweetMetrics(accessToken: string, tweetId: string): Promise<void> {
    const res = await this.run<TweetResponse>("twitter.poll.tweet", () =>
      this.client.get<TweetResponse>(`/tweets/${encodeURIComponent(tweetId)}`, {
        accessToken,
        query: { "tweet.fields": "public_metrics" }
      })
    );
    const metrics = res.data?.public_metrics ?? {};
    const capturedFor = utcDay(this.now());
    this.insights.recordMany([
      {
        platform: PLATFORM,
        objectType: "tweet",
        objectId: tweetId,
        metric: "likes",
        value: metrics.like_count ?? 0,
        capturedFor
      },
      {
        platform: PLATFORM,
        objectType: "tweet",
        objectId: tweetId,
        metric: "retweets",
        value: metrics.retweet_count ?? 0,
        capturedFor
      },
      {
        platform: PLATFORM,
        objectType: "tweet",
        objectId: tweetId,
        metric: "replies",
        value: metrics.reply_count ?? 0,
        capturedFor
      },
      {
        platform: PLATFORM,
        objectType: "tweet",
        objectId: tweetId,
        metric: "quotes",
        value: metrics.quote_count ?? 0,
        capturedFor
      },
      {
        platform: PLATFORM,
        objectType: "tweet",
        objectId: tweetId,
        metric: "impressions",
        value: metrics.impression_count ?? 0,
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
