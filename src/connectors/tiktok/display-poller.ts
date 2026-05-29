/**
 * TikTok display poller (#64).
 *
 * Pulls the connected creator's profile (`GET /user/info/`) and recent videos
 * (`POST /video/list/`) for read-only display. Video engagement counts are
 * persisted into the shared analytics store, reusing the {@link
 * InsightsRepository} (`platform_insights_raw`, migration `0003`) — idempotent
 * on `(platform, object_type, object_id, metric, captured_for)`.
 *
 * Reads share the TikTok rate-limit budget via {@link TikTokDispatcher}.
 */
import type { TikTokDispatcher } from "./dispatcher.js";
import type { InsightsRepository } from "../meta/insights/repository.js";
import type { TikTokRestClient } from "./rest-client.js";

const PLATFORM = "tiktok";

interface UserInfoResponse {
  user?: {
    open_id?: string;
    display_name?: string;
    follower_count?: number;
    likes_count?: number;
  };
}

interface VideoListResponse {
  videos?: Array<{
    id?: string;
    view_count?: number;
    like_count?: number;
    comment_count?: number;
    share_count?: number;
  }>;
}

export interface TikTokDisplayPollerDeps {
  client: TikTokRestClient;
  insights: InsightsRepository;
  dispatcher: TikTokDispatcher;
  platform?: string;
  now?: () => Date;
}

/** User-info fields requested by default. */
export const TIKTOK_USER_FIELDS = ["open_id", "display_name", "follower_count", "likes_count"];
/** Video fields requested by default. */
export const TIKTOK_VIDEO_FIELDS = [
  "id",
  "view_count",
  "like_count",
  "comment_count",
  "share_count"
];

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class TikTokDisplayPoller {
  private readonly client: TikTokRestClient;
  private readonly insights: InsightsRepository;
  private readonly dispatcher: TikTokDispatcher;
  private readonly platform: string;
  private readonly now: () => Date;

  constructor(deps: TikTokDisplayPollerDeps) {
    this.client = deps.client;
    this.insights = deps.insights;
    this.dispatcher = deps.dispatcher;
    this.platform = deps.platform ?? "tiktok";
    this.now = deps.now ?? (() => new Date());
  }

  /** Record the creator's follower count for an open id. */
  async pollUserInfo(accessToken: string, openId: string): Promise<number | undefined> {
    const res = await this.run<UserInfoResponse>("tiktok.poll.user", () =>
      this.client.get<UserInfoResponse>("/user/info/", {
        accessToken,
        query: { fields: TIKTOK_USER_FIELDS.join(",") }
      })
    );
    const followers = res.user?.follower_count;
    if (typeof followers !== "number") return undefined;
    this.insights.record({
      platform: PLATFORM,
      objectType: "account",
      objectId: openId,
      metric: "followers",
      value: followers,
      capturedFor: utcDay(this.now())
    });
    return followers;
  }

  /** Record engagement metrics for the creator's recent videos. */
  async pollVideos(accessToken: string, maxCount = 20): Promise<number> {
    const res = await this.run<VideoListResponse>("tiktok.poll.videos", () =>
      this.client.post<VideoListResponse>("/video/list/", {
        accessToken,
        query: { fields: TIKTOK_VIDEO_FIELDS.join(",") },
        body: { max_count: maxCount }
      })
    );
    const capturedFor = utcDay(this.now());
    let recorded = 0;
    for (const video of res.videos ?? []) {
      if (!video.id) continue;
      this.insights.recordMany([
        {
          platform: PLATFORM,
          objectType: "video",
          objectId: video.id,
          metric: "views",
          value: video.view_count ?? 0,
          capturedFor
        },
        {
          platform: PLATFORM,
          objectType: "video",
          objectId: video.id,
          metric: "likes",
          value: video.like_count ?? 0,
          capturedFor
        },
        {
          platform: PLATFORM,
          objectType: "video",
          objectId: video.id,
          metric: "comments",
          value: video.comment_count ?? 0,
          capturedFor
        },
        {
          platform: PLATFORM,
          objectType: "video",
          objectId: video.id,
          metric: "shares",
          value: video.share_count ?? 0,
          capturedFor
        }
      ]);
      recorded += 1;
    }
    return recorded;
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
