/**
 * Pure weekly-digest composition (epic #95, sub-issue #99).
 *
 * Turns a week of insights into a Markdown digest: the week's top posts and the
 * week-over-week engagement movement per platform. Pure and deterministic —
 * delivery (Telegram broadcast + optional SMTP) is the scheduler's job. Keeping
 * the prose generation here means we can assert on exact Markdown in a unit test
 * instead of mocking a mail server to check a sentence.
 */
import { aggregatePostMetrics } from "./aggregator.js";
import { weekOverWeekDeltas } from "./top-posts.js";
import type { EngagementDelta, InsightRow, PublishedPost, TopPost } from "./types.js";

const DAY_MS = 86_400_000;
const DEFAULT_TOP_LIMIT = 3;

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatDay(epochMs: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric"
  }).format(new Date(epochMs));
}

function formatPct(delta: EngagementDelta): string {
  if (delta.pctChange === null) {
    return delta.thisWeek > 0 ? "new" : "—";
  }
  const arrow = delta.pctChange > 0 ? "▲" : delta.pctChange < 0 ? "▼" : "▬";
  return `${arrow} ${Math.abs(Math.round(delta.pctChange))}%`;
}

export interface DigestData {
  generatedAt: number;
  timezone: string;
  topPosts: TopPost[];
  deltas: EngagementDelta[];
}

/** Render the digest data as a Telegram/SMTP-friendly Markdown string. */
export function buildDigestMarkdown(data: DigestData): string {
  const { generatedAt, timezone, topPosts, deltas } = data;
  const weekStart = generatedAt - 7 * DAY_MS;
  const lines: string[] = [];

  lines.push("📊 *Weekly Analytics Digest*");
  lines.push(`_${formatDay(weekStart, timezone)} – ${formatDay(generatedAt, timezone)}_`);
  lines.push("");

  lines.push("*Engagement vs last week*");
  if (deltas.length === 0) {
    lines.push("No engagement recorded this week.");
  } else {
    for (const d of deltas) {
      lines.push(`• ${d.platform}: ${formatNumber(d.thisWeek)} (${formatPct(d)})`);
    }
  }
  lines.push("");

  lines.push("*Top posts this week*");
  if (topPosts.length === 0) {
    lines.push("No posts to highlight yet.");
  } else {
    topPosts.forEach((post, i) => {
      lines.push(
        `${i + 1}. ${post.platform} — ${post.externalId} (${formatNumber(post.engagement)} engagement)`
      );
    });
  }

  return lines.join("\n");
}

export interface ComposeDigestInput {
  insights: readonly InsightRow[];
  posts: readonly PublishedPost[];
  now: number;
  timezone: string;
  /** Global top-post count (default 3). */
  topLimit?: number;
}

/**
 * Compose a full weekly digest (data + Markdown) from raw inputs. Top posts are
 * ranked GLOBALLY across platforms (the digest is a single highlight reel, not
 * a per-platform breakdown like the dashboard).
 */
export function composeWeeklyDigest(input: ComposeDigestInput): {
  markdown: string;
  data: DigestData;
} {
  const limit = Math.min(Math.max(Math.trunc(input.topLimit ?? DEFAULT_TOP_LIMIT), 1), 100);
  const publishedAt = new Map<string, number>();
  for (const post of input.posts)
    publishedAt.set(`${post.platform}\u0000${post.externalId}`, post.publishedAt);

  const totals = aggregatePostMetrics(input.insights, input.now, 7);
  const ranked: TopPost[] = totals
    .map((t) => ({
      platform: t.platform,
      externalId: t.objectId,
      engagement: t.engagement,
      publishedAt: publishedAt.get(`${t.platform}\u0000${t.objectId}`) ?? null,
      rank: 0
    }))
    .sort((a, b) => b.engagement - a.engagement || a.externalId.localeCompare(b.externalId))
    .slice(0, limit)
    .map((post, i) => ({ ...post, rank: i + 1 }));

  const deltas = weekOverWeekDeltas({ insights: input.insights, now: input.now });
  const data: DigestData = {
    generatedAt: input.now,
    timezone: input.timezone,
    topPosts: ranked,
    deltas
  };
  return { markdown: buildDigestMarkdown(data), data };
}
