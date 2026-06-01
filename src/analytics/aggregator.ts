/**
 * Pure analytics aggregation (epic #95, sub-issue #96).
 *
 * These functions take raw insight readings + published posts and produce the
 * normalised rollups the dashboard and digest read back. They are deliberately
 * PURE — no clock, no DB, no I/O — so the windowing maths can be exhaustively
 * unit-tested with frozen inputs. The thin cron wrapper that pulls rows from
 * SQLite and persists the output lives in `scheduler.ts`; mixing the two would
 * be an untestable mess, and we don't do untestable messes here.
 *
 * Windowing contract: an insight belongs to a trailing N-day window when its
 * `capturedFor` parses as a `YYYY-MM-DD` date that falls within `[now-N, now]`.
 * Non-date keys are silently ignored (they can't be placed on a timeline).
 *
 * Cumulative-metric contract: platforms report cumulative counters (a post's
 * like count only grows), so within a window we take the MAX reading per
 * (object, metric). That is idempotent and robust to repeated daily snapshots.
 */
import {
  ENGAGEMENT_METRICS,
  FOLLOWERS_METRIC,
  IMPRESSION_METRICS,
  POST_LIKE_OBJECT_TYPES,
  ROLLUP_WINDOWS,
  type InsightRow,
  type PublishedPost,
  type RollupRow,
  type RollupWindow
} from "./types.js";

const DAY_MS = 86_400_000;
const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** UTC `YYYY-MM-DD` key for an epoch-ms instant (the daily capture key). */
export function utcDayKey(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/**
 * Parse a `YYYY-MM-DD` capture key to UTC-midnight epoch ms, or `null` when the
 * key is not a calendar date (e.g. a platform end_time token like `"d1"`).
 */
export function parseDayKeyMs(key: string): number | null {
  const m = DAY_KEY_RE.exec(key);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(ms) ? null : ms;
}

function withinWindow(capturedFor: string, now: number, windowDays: number): boolean {
  const ms = parseDayKeyMs(capturedFor);
  if (ms === null) return false;
  return ms >= now - windowDays * DAY_MS && ms <= now;
}

/** Per-post engagement/impression totals for one (platform, window). */
export interface PostMetricTotals {
  platform: string;
  objectId: string;
  engagement: number;
  impressions: number;
}

/**
 * Collapse raw post-like readings into per-post engagement/impression totals
 * for a single trailing window, taking the max reading per (object, metric).
 * Shared by the rollup and the top-post leaderboard so both agree exactly.
 */
export function aggregatePostMetrics(
  insights: readonly InsightRow[],
  now: number,
  windowDays: number
): PostMetricTotals[] {
  // platform|objectId -> metric -> max value seen in window.
  const maxByPostMetric = new Map<string, Map<string, number>>();
  const platformById = new Map<string, { platform: string; objectId: string }>();

  for (const row of insights) {
    if (!POST_LIKE_OBJECT_TYPES.has(row.objectType)) continue;
    if (!withinWindow(row.capturedFor, now, windowDays)) continue;
    const metric = row.metric.toLowerCase();
    if (!ENGAGEMENT_METRICS.has(metric) && !IMPRESSION_METRICS.has(metric)) continue;

    const key = `${row.platform}\u0000${row.objectId}`;
    let metrics = maxByPostMetric.get(key);
    if (!metrics) {
      metrics = new Map<string, number>();
      maxByPostMetric.set(key, metrics);
      platformById.set(key, { platform: row.platform, objectId: row.objectId });
    }
    const prev = metrics.get(metric);
    if (prev === undefined || row.value > prev) metrics.set(metric, row.value);
  }

  const totals: PostMetricTotals[] = [];
  for (const [key, metrics] of maxByPostMetric) {
    const ids = platformById.get(key);
    if (!ids) continue;
    let engagement = 0;
    let impressions = 0;
    for (const [metric, value] of metrics) {
      if (ENGAGEMENT_METRICS.has(metric)) engagement += value;
      else if (IMPRESSION_METRICS.has(metric)) impressions += value;
    }
    totals.push({ platform: ids.platform, objectId: ids.objectId, engagement, impressions });
  }
  return totals;
}

/** Max follower reading per platform within the window (`0` when absent). */
function followersByPlatform(
  insights: readonly InsightRow[],
  now: number,
  windowDays: number
): Map<string, number> {
  const followers = new Map<string, number>();
  for (const row of insights) {
    if (row.metric.toLowerCase() !== FOLLOWERS_METRIC) continue;
    if (!withinWindow(row.capturedFor, now, windowDays)) continue;
    const prev = followers.get(row.platform);
    if (prev === undefined || row.value > prev) followers.set(row.platform, row.value);
  }
  return followers;
}

export interface RollupInput {
  insights: readonly InsightRow[];
  posts: readonly PublishedPost[];
  /** Capture instant (epoch ms). Defaults are never assumed — pass it in. */
  now: number;
  windows?: readonly RollupWindow[];
}

/**
 * Roll raw insights up into per-(platform, window, metric) snapshot rows.
 *
 * Every connected platform (any platform appearing in insights OR published
 * posts) gets a full set of rows for every window — even all-zero ones — so a
 * platform with a poller but no engagement (e.g. a Facebook Page with no post
 * insights writer yet) degrades gracefully to zeros instead of vanishing.
 */
export function rollupEngagement(input: RollupInput): RollupRow[] {
  const { insights, posts, now } = input;
  const windows = input.windows ?? ROLLUP_WINDOWS;
  const capturedFor = utcDayKey(now);

  const platforms = new Set<string>();
  for (const row of insights) platforms.add(row.platform);
  for (const post of posts) platforms.add(post.platform);

  const rows: RollupRow[] = [];
  for (const windowDays of windows) {
    const totals = aggregatePostMetrics(insights, now, windowDays);
    const followers = followersByPlatform(insights, now, windowDays);

    const engagementByPlatform = new Map<string, number>();
    const impressionsByPlatform = new Map<string, number>();
    const postsByPlatform = new Map<string, number>();
    for (const t of totals) {
      engagementByPlatform.set(
        t.platform,
        (engagementByPlatform.get(t.platform) ?? 0) + t.engagement
      );
      impressionsByPlatform.set(
        t.platform,
        (impressionsByPlatform.get(t.platform) ?? 0) + t.impressions
      );
      postsByPlatform.set(t.platform, (postsByPlatform.get(t.platform) ?? 0) + 1);
    }

    for (const platform of [...platforms].sort()) {
      rows.push(
        {
          platform,
          windowDays,
          metric: "engagement",
          value: engagementByPlatform.get(platform) ?? 0,
          capturedFor
        },
        {
          platform,
          windowDays,
          metric: "posts",
          value: postsByPlatform.get(platform) ?? 0,
          capturedFor
        },
        {
          platform,
          windowDays,
          metric: "impressions",
          value: impressionsByPlatform.get(platform) ?? 0,
          capturedFor
        },
        {
          platform,
          windowDays,
          metric: "followers",
          value: followers.get(platform) ?? 0,
          capturedFor
        }
      );
    }
  }
  return rows;
}
