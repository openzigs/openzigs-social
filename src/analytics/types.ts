/**
 * Shared types for the analytics layer (epic #95).
 *
 * The aggregator (#96), router (#97/#98), and weekly digest (#99) all speak in
 * these normalised, platform-agnostic shapes so a Threads "media" like and a
 * Twitter "tweet" like roll up into the same `engagement` number. Keeping the
 * vocabulary here (rather than scattered across modules) is the difference
 * between a coherent system and the kind of copy-pasted enum soup lesser
 * codebases drown in.
 */

/** A single raw metric reading, as stored in `platform_insights_raw` (0003). */
export interface InsightRow {
  platform: string;
  /** e.g. `"account"`, `"post"`, `"media"`, `"pin"`, `"video"`. */
  objectType: string;
  objectId: string;
  metric: string;
  value: number;
  /** The window/day the metric describes, as `YYYY-MM-DD` (or opaque key). */
  capturedFor: string;
}

/** A published outbox post — the source of truth for posting-time heatmaps. */
export interface PublishedPost {
  platform: string;
  /** Platform-native id; joins `InsightRow.objectId` for engagement lookups. */
  externalId: string;
  /** Epoch ms the post reached `published`. */
  publishedAt: number;
}

/** Trailing windows (days) the aggregator rolls metrics over. */
export const ROLLUP_WINDOWS = [7, 30, 90] as const;
export type RollupWindow = (typeof ROLLUP_WINDOWS)[number];

/**
 * Object types that represent an individual published post (as opposed to
 * account-level rollups like `account`/`page`). Engagement and top-post maths
 * only consider these.
 */
export const POST_LIKE_OBJECT_TYPES = new Set(["post", "media", "pin", "video", "tweet", "reel"]);

/** Interaction metrics that sum into a single normalised `engagement` figure. */
export const ENGAGEMENT_METRICS = new Set([
  "likes",
  "comments",
  "replies",
  "retweets",
  "reposts",
  "quotes",
  "shares",
  "reactions",
  "saves",
  "saved",
  "bookmarks"
]);

/** Reach/impression metrics that sum into a normalised `impressions` figure. */
export const IMPRESSION_METRICS = new Set([
  "impressions",
  "page_impressions",
  "views",
  "reach",
  "video_views",
  "impression_count"
]);

/** Account-level follower metric name. */
export const FOLLOWERS_METRIC = "followers";

/** Normalised aggregate metric names persisted in `analytics_rollup`. */
export type RollupMetric = "engagement" | "posts" | "impressions" | "followers";

/** One rolled-up metric value for a (platform, window) on a capture day. */
export interface RollupRow {
  platform: string;
  windowDays: RollupWindow;
  metric: RollupMetric;
  value: number;
  capturedFor: string;
}

/** One posting-time heatmap bucket (day-of-week × hour-of-day). */
export interface HeatmapBucket {
  platform: string;
  /** 0 (Sunday) .. 6 (Saturday) in the configured timezone. */
  dayOfWeek: number;
  /** 0 .. 23 in the configured timezone. */
  hourOfDay: number;
  count: number;
}

/** One ranked top post for a (platform, window). */
export interface TopPost {
  platform: string;
  externalId: string;
  engagement: number;
  publishedAt: number | null;
  rank: number;
}

/** Week-over-week engagement movement for a platform. */
export interface EngagementDelta {
  platform: string;
  thisWeek: number;
  lastWeek: number;
  delta: number;
  /** Percentage change vs last week; `null` when last week was zero. */
  pctChange: number | null;
}
