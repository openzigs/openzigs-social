/**
 * Analytics cache repository (epic #95, sub-issue #96).
 *
 * The ONLY component that touches SQLite for analytics. It reads the shared raw
 * insight store (0003) + published outbox rows (0007) on the way IN, and serves
 * the dashboard/digest from the rolled-up cache tables (0010) on the way OUT.
 * Every statement is a better-sqlite3 prepared statement with bound parameters
 * — there is no string-built SQL here, because SQL injection is not a feature.
 *
 * Snapshot writes are delete-then-insert *within a single transaction* keyed by
 * the capture day, which makes a daily re-run perfectly idempotent: the day's
 * snapshot is replaced wholesale, never duplicated, never left with stale ranks.
 *
 * LIMIT clamping: every list query clamps its limit into a sane range at the
 * repository boundary, so a forged `?limit=-1` can't turn into SQLite's
 * "unbounded result set" foot-gun and dump the whole table.
 */
import type { Database, Statement } from "better-sqlite3";

import type { HeatmapBucket, InsightRow, PublishedPost, RollupRow, TopPost } from "./types.js";

const MAX_SERIES_DAYS = 365;
const MAX_TOP_POSTS = 100;

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  const truncated = Math.trunc(value);
  if (truncated < 1) return fallback;
  return Math.min(truncated, max);
}

interface RawInsightRow {
  platform: string;
  object_type: string;
  object_id: string;
  metric: string;
  value: number | null;
  captured_for: string;
}

interface RawPublishedRow {
  platform: string;
  external_id: string;
  published_at: number;
}

interface RollupReadRow {
  platform: string;
  window_days: number;
  metric: string;
  value: number;
  captured_for: string;
}

interface HeatmapReadRow {
  platform: string;
  day_of_week: number;
  hour_of_day: number;
  post_count: number;
}

interface TopPostReadRow {
  platform: string;
  external_id: string;
  engagement: number;
  published_at: number | null;
  rank: number;
}

export class AnalyticsCacheRepository {
  private readonly db: Database;
  private readonly readInsightsStmt: Statement;
  private readonly readPostsStmt: Statement;
  private readonly insertRollupStmt: Statement;
  private readonly deleteRollupDayStmt: Statement;
  private readonly insertHeatmapStmt: Statement;
  private readonly deleteHeatmapDayStmt: Statement;
  private readonly insertTopPostStmt: Statement;
  private readonly deleteTopPostsDayStmt: Statement;

  constructor(db: Database) {
    this.db = db;
    this.readInsightsStmt = db.prepare(
      `SELECT platform, object_type, object_id, metric, value, captured_for
       FROM platform_insights_raw
       WHERE value IS NOT NULL`
    );
    this.readPostsStmt = db.prepare(
      `SELECT platform, external_id, published_at
       FROM outbox
       WHERE status = 'published' AND external_id IS NOT NULL AND published_at IS NOT NULL`
    );
    this.insertRollupStmt = db.prepare(
      `INSERT INTO analytics_rollup (platform, window_days, metric, value, captured_for)
       VALUES (@platform, @windowDays, @metric, @value, @capturedFor)
       ON CONFLICT (platform, window_days, metric, captured_for)
       DO UPDATE SET value = excluded.value, captured_at = datetime('now')`
    );
    this.deleteRollupDayStmt = db.prepare(`DELETE FROM analytics_rollup WHERE captured_for = ?`);
    this.insertHeatmapStmt = db.prepare(
      `INSERT INTO analytics_heatmap (platform, day_of_week, hour_of_day, post_count, captured_for)
       VALUES (@platform, @dayOfWeek, @hourOfDay, @count, @capturedFor)
       ON CONFLICT (platform, day_of_week, hour_of_day, captured_for)
       DO UPDATE SET post_count = excluded.post_count, captured_at = datetime('now')`
    );
    this.deleteHeatmapDayStmt = db.prepare(`DELETE FROM analytics_heatmap WHERE captured_for = ?`);
    this.insertTopPostStmt = db.prepare(
      `INSERT INTO analytics_top_posts
         (platform, window_days, external_id, engagement, published_at, rank, captured_for)
       VALUES (@platform, @windowDays, @externalId, @engagement, @publishedAt, @rank, @capturedFor)
       ON CONFLICT (platform, window_days, external_id, captured_for)
       DO UPDATE SET engagement = excluded.engagement,
                     published_at = excluded.published_at,
                     rank = excluded.rank,
                     captured_at = datetime('now')`
    );
    this.deleteTopPostsDayStmt = db.prepare(
      `DELETE FROM analytics_top_posts WHERE captured_for = ?`
    );
  }

  /** Read all non-null raw insight readings (the aggregator's input). */
  readInsightRows(): InsightRow[] {
    const rows = this.readInsightsStmt.all() as RawInsightRow[];
    return rows.map((r) => ({
      platform: r.platform,
      objectType: r.object_type,
      objectId: r.object_id,
      metric: r.metric,
      value: r.value ?? 0,
      capturedFor: r.captured_for
    }));
  }

  /** Read all published outbox posts (heatmap + top-post timestamps). */
  readPublishedPosts(): PublishedPost[] {
    const rows = this.readPostsStmt.all() as RawPublishedRow[];
    return rows.map((r) => ({
      platform: r.platform,
      externalId: r.external_id,
      publishedAt: r.published_at
    }));
  }

  /**
   * Persist a full daily snapshot (rollups + heatmap + top posts) atomically,
   * replacing any prior snapshot for the same capture day. `topPostsByWindow`
   * maps a window (days) to its already-ranked leaderboard.
   */
  writeSnapshot(snapshot: {
    capturedFor: string;
    rollups: readonly RollupRow[];
    heatmap: readonly HeatmapBucket[];
    topPostsByWindow: ReadonlyMap<number, readonly TopPost[]>;
  }): void {
    const { capturedFor, rollups, heatmap, topPostsByWindow } = snapshot;
    const tx = this.db.transaction(() => {
      this.deleteRollupDayStmt.run(capturedFor);
      for (const row of rollups) {
        this.insertRollupStmt.run({
          platform: row.platform,
          windowDays: row.windowDays,
          metric: row.metric,
          value: row.value,
          capturedFor
        });
      }

      this.deleteHeatmapDayStmt.run(capturedFor);
      for (const bucket of heatmap) {
        this.insertHeatmapStmt.run({
          platform: bucket.platform,
          dayOfWeek: bucket.dayOfWeek,
          hourOfDay: bucket.hourOfDay,
          count: bucket.count,
          capturedFor
        });
      }

      this.deleteTopPostsDayStmt.run(capturedFor);
      for (const [windowDays, posts] of topPostsByWindow) {
        for (const post of posts) {
          this.insertTopPostStmt.run({
            platform: post.platform,
            windowDays,
            externalId: post.externalId,
            engagement: post.engagement,
            publishedAt: post.publishedAt,
            rank: post.rank,
            capturedFor
          });
        }
      }
    });
    tx();
  }

  /** Most recent capture day present in the rollup cache, or `null`. */
  latestCapturedFor(): string | null {
    const row = this.db.prepare(`SELECT MAX(captured_for) AS day FROM analytics_rollup`).get() as
      | { day: string | null }
      | undefined;
    return row?.day ?? null;
  }

  /** Latest-day rollup rows for a window, optionally filtered by platform. */
  getSummary(windowDays: number, platform?: string): RollupRow[] {
    const day = this.latestCapturedFor();
    if (day === null) return [];
    const rows = (
      platform === undefined
        ? this.db
            .prepare(
              `SELECT platform, window_days, metric, value, captured_for
               FROM analytics_rollup
               WHERE captured_for = ? AND window_days = ?
               ORDER BY platform, metric`
            )
            .all(day, windowDays)
        : this.db
            .prepare(
              `SELECT platform, window_days, metric, value, captured_for
               FROM analytics_rollup
               WHERE captured_for = ? AND window_days = ? AND platform = ?
               ORDER BY platform, metric`
            )
            .all(day, windowDays, platform)
    ) as RollupReadRow[];
    return rows.map(this.toRollupRow);
  }

  /**
   * Engagement time series (one `engagement` value per captured day) for a
   * window, optionally filtered by platform. `days` caps how far back to look.
   */
  getEngagementSeries(windowDays: number, platform?: string, days?: number): RollupRow[] {
    const limit = clampLimit(days, 90, MAX_SERIES_DAYS);
    const rows = (
      platform === undefined
        ? this.db
            .prepare(
              `SELECT platform, window_days, metric, value, captured_for
               FROM analytics_rollup
               WHERE window_days = ? AND metric = 'engagement'
               ORDER BY captured_for DESC, platform
               LIMIT ?`
            )
            .all(windowDays, limit * 8)
        : this.db
            .prepare(
              `SELECT platform, window_days, metric, value, captured_for
               FROM analytics_rollup
               WHERE window_days = ? AND metric = 'engagement' AND platform = ?
               ORDER BY captured_for DESC
               LIMIT ?`
            )
            .all(windowDays, platform, limit)
    ) as RollupReadRow[];
    return rows.map(this.toRollupRow).reverse();
  }

  /** Latest-day heatmap buckets, optionally filtered by platform. */
  getHeatmap(platform?: string): HeatmapBucket[] {
    const day = this.db.prepare(`SELECT MAX(captured_for) AS day FROM analytics_heatmap`).get() as
      | { day: string | null }
      | undefined;
    if (!day?.day) return [];
    const rows = (
      platform === undefined
        ? this.db
            .prepare(
              `SELECT platform, day_of_week, hour_of_day, post_count
               FROM analytics_heatmap
               WHERE captured_for = ?
               ORDER BY platform, day_of_week, hour_of_day`
            )
            .all(day.day)
        : this.db
            .prepare(
              `SELECT platform, day_of_week, hour_of_day, post_count
               FROM analytics_heatmap
               WHERE captured_for = ? AND platform = ?
               ORDER BY day_of_week, hour_of_day`
            )
            .all(day.day, platform)
    ) as HeatmapReadRow[];
    return rows.map((r) => ({
      platform: r.platform,
      dayOfWeek: r.day_of_week,
      hourOfDay: r.hour_of_day,
      count: r.post_count
    }));
  }

  /** Latest-day top posts for a window, optionally filtered by platform. */
  getTopPosts(windowDays: number, platform?: string, limit?: number): TopPost[] {
    const day = this.db
      .prepare(`SELECT MAX(captured_for) AS day FROM analytics_top_posts`)
      .get() as { day: string | null } | undefined;
    if (!day?.day) return [];
    const max = clampLimit(limit, 10, MAX_TOP_POSTS);
    const rows = (
      platform === undefined
        ? this.db
            .prepare(
              `SELECT platform, external_id, engagement, published_at, rank
               FROM analytics_top_posts
               WHERE captured_for = ? AND window_days = ?
               ORDER BY engagement DESC, platform, external_id
               LIMIT ?`
            )
            .all(day.day, windowDays, max)
        : this.db
            .prepare(
              `SELECT platform, external_id, engagement, published_at, rank
               FROM analytics_top_posts
               WHERE captured_for = ? AND window_days = ? AND platform = ?
               ORDER BY rank
               LIMIT ?`
            )
            .all(day.day, windowDays, platform, max)
    ) as TopPostReadRow[];
    return rows.map((r) => ({
      platform: r.platform,
      externalId: r.external_id,
      engagement: r.engagement,
      publishedAt: r.published_at,
      rank: r.rank
    }));
  }

  private toRollupRow(r: RollupReadRow): RollupRow {
    return {
      platform: r.platform,
      windowDays: r.window_days as RollupRow["windowDays"],
      metric: r.metric as RollupRow["metric"],
      value: r.value,
      capturedFor: r.captured_for
    };
  }
}
