/**
 * Pure top-post leaderboard + week-over-week engagement deltas (epic #95,
 * sub-issues #97 and #99).
 *
 * Built on the same `aggregatePostMetrics` primitive the rollup uses, so the
 * "top posts" the dashboard shows and the totals the KPI cards show can never
 * disagree. Published timestamps are joined in from the outbox so the digest
 * can say *when* a winning post went out.
 */
import { aggregatePostMetrics } from "./aggregator.js";
import type { EngagementDelta, InsightRow, PublishedPost, TopPost } from "./types.js";

const DEFAULT_TOP_LIMIT = 3;

function publishedAtIndex(posts: readonly PublishedPost[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const post of posts) index.set(`${post.platform}\u0000${post.externalId}`, post.publishedAt);
  return index;
}

export interface TopPostsInput {
  insights: readonly InsightRow[];
  posts: readonly PublishedPost[];
  now: number;
  windowDays: number;
  /** Per-platform cap (default 3). Clamped to `[1, 100]`. */
  limit?: number;
  /** When set, restrict the leaderboard to a single platform. */
  platform?: string;
}

/**
 * Rank posts by engagement within a trailing window. When `platform` is given,
 * returns a single platform's leaderboard; otherwise returns the top posts per
 * platform (each platform ranked independently from 1).
 */
export function topPosts(input: TopPostsInput): TopPost[] {
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? DEFAULT_TOP_LIMIT), 1), 100);
  const publishedAt = publishedAtIndex(input.posts);
  const totals = aggregatePostMetrics(input.insights, input.now, input.windowDays).filter(
    (t) => input.platform === undefined || t.platform === input.platform
  );

  const byPlatform = new Map<string, TopPost[]>();
  for (const t of totals) {
    const list = byPlatform.get(t.platform) ?? [];
    list.push({
      platform: t.platform,
      externalId: t.objectId,
      engagement: t.engagement,
      publishedAt: publishedAt.get(`${t.platform}\u0000${t.objectId}`) ?? null,
      rank: 0
    });
    byPlatform.set(t.platform, list);
  }

  const result: TopPost[] = [];
  for (const platform of [...byPlatform.keys()].sort()) {
    const list = byPlatform.get(platform)!;
    list.sort((a, b) => b.engagement - a.engagement || a.externalId.localeCompare(b.externalId));
    list.slice(0, limit).forEach((post, i) => result.push({ ...post, rank: i + 1 }));
  }
  return result;
}

function totalEngagement(totals: { engagement: number }[]): number {
  return totals.reduce((sum, t) => sum + t.engagement, 0);
}

export interface DeltaInput {
  insights: readonly InsightRow[];
  now: number;
}

/**
 * Week-over-week engagement movement per platform: this trailing 7 days vs the
 * 7 days before that. `pctChange` is `null` when last week was zero (avoids the
 * division-by-zero "∞%" garbage you see in amateur dashboards).
 */
export function weekOverWeekDeltas(input: DeltaInput): EngagementDelta[] {
  const { insights, now } = input;
  const DAY_MS = 86_400_000;
  const thisWeekTotals = aggregatePostMetrics(insights, now, 7);
  // Last week = the 7-day window ending 7 days ago.
  const lastWeekTotals = aggregatePostMetrics(insights, now - 7 * DAY_MS, 7);

  const platforms = new Set<string>();
  const thisByPlatform = new Map<string, { engagement: number }[]>();
  const lastByPlatform = new Map<string, { engagement: number }[]>();
  for (const t of thisWeekTotals) {
    platforms.add(t.platform);
    (thisByPlatform.get(t.platform) ?? thisByPlatform.set(t.platform, []).get(t.platform)!).push(t);
  }
  for (const t of lastWeekTotals) {
    platforms.add(t.platform);
    (lastByPlatform.get(t.platform) ?? lastByPlatform.set(t.platform, []).get(t.platform)!).push(t);
  }

  const deltas: EngagementDelta[] = [];
  for (const platform of [...platforms].sort()) {
    const thisWeek = totalEngagement(thisByPlatform.get(platform) ?? []);
    const lastWeek = totalEngagement(lastByPlatform.get(platform) ?? []);
    deltas.push({
      platform,
      thisWeek,
      lastWeek,
      delta: thisWeek - lastWeek,
      pctChange: lastWeek === 0 ? null : ((thisWeek - lastWeek) / lastWeek) * 100
    });
  }
  return deltas;
}
