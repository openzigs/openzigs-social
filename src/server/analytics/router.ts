/**
 * Analytics API router (epic #95, sub-issues #97 and #98).
 *
 * Routes (under `/api/analytics`):
 *   - GET /summary    — KPI rollup (engagement/posts/impressions/followers)
 *   - GET /engagement — per-platform engagement time series
 *   - GET /heatmap    — posting-time day×hour grid + dense 7×24 matrix
 *   - GET /top-posts  — top posts by engagement for a window
 *
 * Every route is read-only and served entirely from the rolled-up cache tables
 * (0010) — never the raw store, never a live platform API — so the dashboard's
 * platform filter re-renders well inside the 200ms target. Reads are pure cache
 * lookups, yet they still carry the same 60-req/min/IP limiter as the mutating
 * routers (OWASP `js/missing-rate-limiting`): a cheap endpoint is still a DoS
 * amplifier if you leave it unthrottled. `window` is validated against a fixed
 * allow-list (422 otherwise) and `limit`/`days` are clamped, so a forged query
 * string can neither inject nor dump the table.
 */
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";

import { toHeatmapMatrix } from "../../analytics/heatmap.js";
import type { AnalyticsCacheRepository } from "../../analytics/repository.js";
import { ROLLUP_WINDOWS, type RollupMetric, type RollupWindow } from "../../analytics/types.js";

/** Allowed trailing windows; anything else is a 422. */
const VALID_WINDOWS = new Set<number>(ROLLUP_WINDOWS);

/** Platform keys are short lowercase tokens; reject anything exotic. */
const PLATFORM_RE = /^[a-z0-9_-]{1,32}$/;

export interface AnalyticsRouterDeps {
  repo: AnalyticsCacheRepository;
}

function parseWindow(raw: unknown): RollupWindow | undefined | null {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") return null;
  const n = Number(raw);
  return VALID_WINDOWS.has(n) ? (n as RollupWindow) : null;
}

function parsePlatform(raw: unknown): string | undefined | null {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !PLATFORM_RE.test(raw)) return null;
  return raw;
}

function parsePositiveInt(raw: unknown): number | undefined | null {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Build the analytics router bound to the cache repository. */
export function createAnalyticsRouter(deps: AnalyticsRouterDeps): Router {
  const router = Router();
  const repo = deps.repo;

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false
  });

  router.use(limiter);

  function reject(res: Response, message: string): void {
    res.status(422).json({ timestamp: new Date().toISOString(), error: message });
  }

  // GET /summary?window=&platform= -------------------------------------------
  router.get("/summary", (req: Request, res: Response) => {
    const window = parseWindow(req.query.window);
    if (window === null) return reject(res, "window must be one of 7, 30, 90");
    const platform = parsePlatform(req.query.platform);
    if (platform === null) return reject(res, "invalid platform");

    const rows = repo.getSummary(window ?? 30, platform);
    const perPlatform = new Map<string, Record<RollupMetric, number>>();
    const totals: Record<RollupMetric, number> = {
      engagement: 0,
      posts: 0,
      impressions: 0,
      followers: 0
    };
    for (const row of rows) {
      const bucket =
        perPlatform.get(row.platform) ??
        ({ engagement: 0, posts: 0, impressions: 0, followers: 0 } as Record<RollupMetric, number>);
      bucket[row.metric] = row.value;
      perPlatform.set(row.platform, bucket);
      totals[row.metric] += row.value;
    }
    const avgEngagementPerPost = totals.posts > 0 ? totals.engagement / totals.posts : 0;

    res.status(200).json({
      timestamp: new Date().toISOString(),
      window: window ?? 30,
      totals: { ...totals, avgEngagementPerPost },
      perPlatform: [...perPlatform.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, metrics]) => ({ platform: name, ...metrics }))
    });
  });

  // GET /engagement?window=&platform=&days= ----------------------------------
  router.get("/engagement", (req: Request, res: Response) => {
    const window = parseWindow(req.query.window);
    if (window === null) return reject(res, "window must be one of 7, 30, 90");
    const platform = parsePlatform(req.query.platform);
    if (platform === null) return reject(res, "invalid platform");
    const days = parsePositiveInt(req.query.days);
    if (days === null) return reject(res, "days must be a positive integer");

    const rows = repo.getEngagementSeries(window ?? 30, platform, days ?? undefined);
    res.status(200).json({
      timestamp: new Date().toISOString(),
      window: window ?? 30,
      series: rows.map((r) => ({
        platform: r.platform,
        capturedFor: r.capturedFor,
        engagement: r.value
      }))
    });
  });

  // GET /heatmap?platform= ---------------------------------------------------
  router.get("/heatmap", (req: Request, res: Response) => {
    const platform = parsePlatform(req.query.platform);
    if (platform === null) return reject(res, "invalid platform");

    const buckets = repo.getHeatmap(platform);
    res.status(200).json({
      timestamp: new Date().toISOString(),
      buckets,
      matrix: toHeatmapMatrix(buckets)
    });
  });

  // GET /top-posts?window=&platform=&limit= ----------------------------------
  router.get("/top-posts", (req: Request, res: Response) => {
    const window = parseWindow(req.query.window);
    if (window === null) return reject(res, "window must be one of 7, 30, 90");
    const platform = parsePlatform(req.query.platform);
    if (platform === null) return reject(res, "invalid platform");
    const limit = parsePositiveInt(req.query.limit);
    if (limit === null) return reject(res, "limit must be a positive integer");

    const posts = repo.getTopPosts(window ?? 30, platform, limit ?? undefined);
    res.status(200).json({
      timestamp: new Date().toISOString(),
      window: window ?? 30,
      posts
    });
  });

  return router;
}
